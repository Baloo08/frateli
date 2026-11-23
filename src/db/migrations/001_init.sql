-- ============================================================================
-- Frateli LMS — Esquema DDL Maestro PostgreSQL 16
-- Incluye los 5 dominios base (24 tablas) + Integraciones Google & IA Gemini
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('superadmin', 'teacher', 'student');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('invited', 'active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- ============================================================================
-- Dominio A: Identidad, RBAC, Capacidades y Auditoría
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                 CITEXT NOT NULL UNIQUE,
    password_hash         TEXT NOT NULL,
    full_name             TEXT NOT NULL CHECK (char_length(trim(full_name)) >= 2),
    role                  user_role NOT NULL,
    status                user_status NOT NULL DEFAULT 'invited',
    preferred_locale      CHAR(2) NOT NULL DEFAULT 'es' CHECK (preferred_locale IN ('es', 'en')),
    video_editor_enabled  BOOLEAN NOT NULL DEFAULT false,
    storage_quota_bytes   BIGINT NOT NULL DEFAULT 10737418240 CHECK (storage_quota_bytes >= 0),
    invite_token_hash     CHAR(64) CHECK (invite_token_hash IS NULL OR invite_token_hash ~ '^[a-f0-9]{64}$'),
    invite_expires_at     TIMESTAMPTZ,
    avatar_key            TEXT,
    last_login_at         TIMESTAMPTZ,
    created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_students_no_video_editor
        CHECK (role <> 'student' OR video_editor_enabled = false),
    CONSTRAINT chk_superadmin_video_editor
        CHECK (role <> 'superadmin' OR video_editor_enabled = true),
    CONSTRAINT chk_users_invite_consistency
        CHECK (
            (invite_token_hash IS NULL AND invite_expires_at IS NULL)
            OR (invite_token_hash IS NOT NULL AND invite_expires_at IS NOT NULL)
        )
);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS teacher_profiles (
    user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bio_es               TEXT,
    bio_en               TEXT,
    specialty_es         TEXT,
    specialty_en         TEXT,
    can_publish_courses  BOOLEAN NOT NULL DEFAULT false,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_teacher_profiles_updated_at ON teacher_profiles;
CREATE TRIGGER trg_teacher_profiles_updated_at
    BEFORE UPDATE ON teacher_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS capability_requests (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    capability    TEXT NOT NULL CHECK (capability IN ('video_editor_enabled')),
    justification TEXT NOT NULL CHECK (char_length(trim(justification)) >= 10),
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by   UUID REFERENCES users(id) ON DELETE RESTRICT,
    review_note   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at   TIMESTAMPTZ,
    CONSTRAINT chk_capability_request_review_consistency
        CHECK (
            (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
            OR (status IN ('approved', 'rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_capability_requests_one_pending
    ON capability_requests (teacher_id, capability)
    WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS capability_grants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    capability      TEXT NOT NULL CHECK (capability IN ('video_editor_enabled', 'can_publish_courses')),
    granted         BOOLEAN NOT NULL,
    actor_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reason          TEXT NOT NULL CHECK (char_length(trim(reason)) >= 10),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  CHAR(64) NOT NULL UNIQUE,
    ip_address  INET,
    user_agent  TEXT,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    event_id        UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    actor_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_role      user_role,
    portal_context  TEXT NOT NULL CHECK (portal_context IN ('admin', 'teach', 'learn', 'studio', 'system')),
    action          TEXT NOT NULL,
    resource_type   TEXT NOT NULL,
    resource_id     TEXT NOT NULL,
    reason          TEXT,
    before_state    JSONB,
    after_state     JSONB,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address      INET,
    user_agent      TEXT,
    request_id      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Dominio B y C: Currículo Bilingüe y Video Studio
-- ============================================================================

CREATE TABLE IF NOT EXISTS courses (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug               TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    title_es           TEXT NOT NULL CHECK (char_length(trim(title_es)) >= 3),
    title_en           TEXT NOT NULL CHECK (char_length(trim(title_en)) >= 3),
    description_es     TEXT NOT NULL,
    description_en     TEXT NOT NULL,
    content_locale     CHAR(2) NOT NULL DEFAULT 'es' CHECK (content_locale IN ('es', 'en')),
    thumbnail_key      TEXT,
    status             TEXT NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft', 'pending_review', 'published', 'archived')),
    passing_grade_pct  NUMERIC(5,2) NOT NULL DEFAULT 70.00
                           CHECK (passing_grade_pct > 0 AND passing_grade_pct <= 100),
    created_by         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    enabled_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    enabled_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_courses_updated_at ON courses;
CREATE TRIGGER trg_courses_updated_at
    BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS course_teachers (
    course_id    UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    teacher_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_primary   BOOLEAN NOT NULL DEFAULT false,
    assigned_by  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (course_id, teacher_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_course_teachers_primary
    ON course_teachers (course_id)
    WHERE is_primary = true;

CREATE TABLE IF NOT EXISTS modules (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id     UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title_es      TEXT NOT NULL CHECK (char_length(trim(title_es)) >= 1),
    title_en      TEXT NOT NULL CHECK (char_length(trim(title_en)) >= 1),
    sort_order    INT NOT NULL CHECK (sort_order >= 0),
    is_published  BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_modules_course_sort_order
        UNIQUE (course_id, sort_order) DEFERRABLE INITIALLY DEFERRED
);

DROP TRIGGER IF EXISTS trg_modules_updated_at ON modules;
CREATE TRIGGER trg_modules_updated_at
    BEFORE UPDATE ON modules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS video_projects (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id             UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    course_id            UUID REFERENCES courses(id) ON DELETE SET NULL,
    lesson_id            UUID,
    title                TEXT NOT NULL CHECK (char_length(trim(title)) >= 1),
    content_locale       CHAR(2) NOT NULL DEFAULT 'es' CHECK (content_locale IN ('es', 'en')),
    edl_json             JSONB NOT NULL DEFAULT '{"schemaVersion":1,"sources":[],"tracks":{"videoClips":[],"overlays":[],"captions":{"locale":"es","cues":[]}}}'::jsonb,
    source_uploads_json  JSONB NOT NULL DEFAULT '[]'::jsonb,
    status               TEXT NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft', 'uploading', 'queued', 'rendering', 'ready', 'failed')),
    latest_asset_id      UUID,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_video_projects_updated_at ON video_projects;
CREATE TRIGGER trg_video_projects_updated_at
    BEFORE UPDATE ON video_projects
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS video_assets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID REFERENCES video_projects(id) ON DELETE SET NULL,
    owner_id            UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    storage_driver      TEXT NOT NULL CHECK (storage_driver IN ('s3', 'local')),
    source_provider     TEXT NOT NULL DEFAULT 'studio' CHECK (source_provider IN ('studio', 'upload', 'google_drive')),
    external_file_id    TEXT,
    raw_object_key      TEXT,
    hls_master_key      TEXT,
    mp4_fallback_key    TEXT,
    thumbnail_key       TEXT,
    vtt_es_key          TEXT,
    vtt_en_key          TEXT,
    audio_desc_vtt_key  TEXT,
    duration_sec        INT NOT NULL DEFAULT 0 CHECK (duration_sec >= 0),
    width               INT CHECK (width IS NULL OR width > 0),
    height              INT CHECK (height IS NULL OR height > 0),
    total_size_bytes    BIGINT NOT NULL DEFAULT 0 CHECK (total_size_bytes >= 0),
    status              TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'processing', 'ready', 'failed', 'archived')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_video_assets_updated_at ON video_assets;
CREATE TRIGGER trg_video_assets_updated_at
    BEFORE UPDATE ON video_assets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DO $$ BEGIN
    ALTER TABLE video_projects
        ADD CONSTRAINT fk_video_projects_latest_asset
        FOREIGN KEY (latest_asset_id) REFERENCES video_assets(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS lessons (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id       UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    lesson_type     TEXT NOT NULL CHECK (lesson_type IN ('video', 'article', 'quiz')),
    title_es        TEXT NOT NULL CHECK (char_length(trim(title_es)) >= 1),
    title_en        TEXT NOT NULL CHECK (char_length(trim(title_en)) >= 1),
    content_md_es   TEXT,
    content_md_en   TEXT,
    content_locale  CHAR(2) NOT NULL DEFAULT 'es' CHECK (content_locale IN ('es', 'en')),
    video_asset_id  UUID REFERENCES video_assets(id) ON DELETE SET NULL,
    duration_sec    INT NOT NULL DEFAULT 0 CHECK (duration_sec >= 0),
    sort_order      INT NOT NULL CHECK (sort_order >= 0),
    is_published    BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_lessons_module_sort_order
        UNIQUE (module_id, sort_order) DEFERRABLE INITIALLY DEFERRED
);

DROP TRIGGER IF EXISTS trg_lessons_updated_at ON lessons;
CREATE TRIGGER trg_lessons_updated_at
    BEFORE UPDATE ON lessons
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DO $$ BEGIN
    ALTER TABLE video_projects
        ADD CONSTRAINT fk_video_projects_lesson
        FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS lesson_resources (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id         UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    title_es          TEXT NOT NULL,
    title_en          TEXT NOT NULL,
    storage_driver    TEXT NOT NULL DEFAULT 'local' CHECK (storage_driver IN ('s3', 'local', 'external')),
    source_provider   TEXT NOT NULL DEFAULT 'upload' CHECK (source_provider IN ('upload', 'google_drive', 'google_docs', 'google_slides', 'google_sheets', 'ai_generated')),
    external_file_id  TEXT,
    external_web_url  TEXT,
    file_key          TEXT NOT NULL,
    mime_type         TEXT NOT NULL,
    size_bytes        BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
    last_synced_at    TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS video_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_asset_id  UUID NOT NULL REFERENCES video_assets(id) ON DELETE CASCADE,
    bullmq_job_id   TEXT,
    job_type        TEXT NOT NULL CHECK (job_type IN ('render_edl', 'transcode_hls', 'thumbnail', 'captions', 'drive_import')),
    status          TEXT NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued', 'active', 'completed', 'failed')),
    progress_pct    SMALLINT NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
    attempts        SMALLINT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    error_message   TEXT,
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Dominio D: Estudiantes, Interacción, Evaluaciones y Certificados
-- ============================================================================

CREATE TABLE IF NOT EXISTS enrollments (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id                   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    status                      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'dropped')),
    progress_pct                NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (progress_pct BETWEEN 0 AND 100),
    final_grade_pct             NUMERIC(5,2) CHECK (final_grade_pct IS NULL OR final_grade_pct BETWEEN 0 AND 100),
    assessment_time_multiplier  NUMERIC(3,2) NOT NULL DEFAULT 1.00 CHECK (assessment_time_multiplier IN (1.00, 1.50, 2.00)),
    assessment_untimed          BOOLEAN NOT NULL DEFAULT false,
    enrolled_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at                TIMESTAMPTZ,
    CONSTRAINT uq_enrollments_student_course UNIQUE (student_id, course_id)
);

CREATE TABLE IF NOT EXISTS lesson_progress (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id      UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    lesson_id          UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    watched_sec        INT NOT NULL DEFAULT 0 CHECK (watched_sec >= 0),
    last_position_sec  INT NOT NULL DEFAULT 0 CHECK (last_position_sec >= 0),
    is_completed       BOOLEAN NOT NULL DEFAULT false,
    completed_at       TIMESTAMPTZ,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_lesson_progress_enrollment_lesson UNIQUE (enrollment_id, lesson_id)
);

DROP TRIGGER IF EXISTS trg_lesson_progress_updated_at ON lesson_progress;
CREATE TRIGGER trg_lesson_progress_updated_at
    BEFORE UPDATE ON lesson_progress
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS course_discussions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id       UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    lesson_id       UUID REFERENCES lessons(id) ON DELETE CASCADE,
    parent_id       UUID REFERENCES course_discussions(id) ON DELETE CASCADE,
    author_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_locale  CHAR(2) NOT NULL DEFAULT 'es' CHECK (content_locale IN ('es', 'en')),
    body            TEXT NOT NULL CHECK (char_length(trim(body)) >= 1),
    is_pinned       BOOLEAN NOT NULL DEFAULT false,
    is_resolved     BOOLEAN NOT NULL DEFAULT false,
    edited_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS direct_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id       UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_locale  CHAR(2) NOT NULL DEFAULT 'es' CHECK (content_locale IN ('es', 'en')),
    body            TEXT NOT NULL CHECK (char_length(trim(body)) >= 1),
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_direct_messages_no_self CHECK (sender_id <> recipient_id)
);

CREATE TABLE IF NOT EXISTS assessments (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id          UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    module_id          UUID REFERENCES modules(id) ON DELETE SET NULL,
    title_es           TEXT NOT NULL,
    title_en           TEXT NOT NULL,
    instructions_es    TEXT,
    instructions_en    TEXT,
    passing_score_pct  NUMERIC(5,2) NOT NULL DEFAULT 70.00 CHECK (passing_score_pct BETWEEN 0 AND 100),
    max_attempts       INT NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
    time_limit_min     INT CHECK (time_limit_min IS NULL OR time_limit_min > 0),
    weight_pct         NUMERIC(5,2) NOT NULL DEFAULT 100.00 CHECK (weight_pct >= 0 AND weight_pct <= 100),
    is_published       BOOLEAN NOT NULL DEFAULT false,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_assessments_updated_at ON assessments;
CREATE TRIGGER trg_assessments_updated_at
    BEFORE UPDATE ON assessments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS assessment_questions (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id        UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    question_type        TEXT NOT NULL CHECK (question_type IN ('single_choice', 'multi_choice', 'true_false', 'short_answer')),
    prompt_es            TEXT NOT NULL,
    prompt_en            TEXT NOT NULL,
    options_json         JSONB NOT NULL DEFAULT '[]'::jsonb,
    correct_answer_json  JSONB NOT NULL,
    explanation_es       TEXT,
    explanation_en       TEXT,
    points               NUMERIC(6,2) NOT NULL DEFAULT 1.00 CHECK (points > 0),
    sort_order           INT NOT NULL CHECK (sort_order >= 0),
    CONSTRAINT uq_assessment_questions_sort_order
        UNIQUE (assessment_id, sort_order) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS assessment_submissions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id     UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    student_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    attempt_no        INT NOT NULL CHECK (attempt_no >= 1),
    answers_json      JSONB NOT NULL,
    auto_score        NUMERIC(6,2) CHECK (auto_score IS NULL OR auto_score >= 0),
    manual_score      NUMERIC(6,2) CHECK (manual_score IS NULL OR manual_score >= 0),
    final_score_pct   NUMERIC(5,2) CHECK (final_score_pct IS NULL OR final_score_pct BETWEEN 0 AND 100),
    passed            BOOLEAN,
    teacher_feedback  TEXT,
    graded_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    graded_at         TIMESTAMPTZ,
    submitted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_assessment_submissions_attempt
        UNIQUE (assessment_id, student_id, attempt_no)
);

CREATE TABLE IF NOT EXISTS certificates (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id      UUID NOT NULL UNIQUE REFERENCES enrollments(id) ON DELETE RESTRICT,
    student_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    course_id          UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    verification_code  TEXT NOT NULL UNIQUE CHECK (verification_code ~ '^FRT-[0-9]{4}-[A-HJ-NP-Z2-9]{8}$'),
    verification_hash  CHAR(64) NOT NULL UNIQUE CHECK (verification_hash ~ '^[a-f0-9]{64}$'),
    metadata_snapshot  JSONB NOT NULL,
    pdf_storage_key    TEXT NOT NULL,
    issued_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at         TIMESTAMPTZ,
    revoked_by         UUID REFERENCES users(id) ON DELETE RESTRICT,
    revocation_reason  TEXT,
    CONSTRAINT chk_certificates_revocation_consistency
        CHECK (
            (revoked_at IS NULL AND revoked_by IS NULL)
            OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revocation_reason IS NOT NULL)
        )
);

-- ============================================================================
-- Dominio E: Correo Outbox y Notificaciones
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_outbox (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    recipient_email    CITEXT NOT NULL,
    template_key       TEXT NOT NULL CHECK (template_key IN (
                           'invite_teacher',
                           'account_suspended',
                           'password_reset',
                           'video_studio_enabled',
                           'video_studio_disabled',
                           'video_studio_requested',
                           'course_published',
                           'course_rejected',
                           'quiz_graded',
                           'certificate_issued'
                       )),
    locale             CHAR(2) NOT NULL DEFAULT 'es' CHECK (locale IN ('es', 'en')),
    subject            TEXT NOT NULL,
    payload_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
    status             TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'queued', 'sent', 'failed', 'suppressed')),
    smtp_message_id    TEXT,
    attempts           SMALLINT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error         TEXT,
    scheduled_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at            TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    title_es    TEXT NOT NULL,
    title_en    TEXT NOT NULL,
    link_path   TEXT NOT NULL,
    is_read     BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Dominio F: Integración Google Workspace / Drive y Generación IA Gemini
-- ============================================================================

CREATE TABLE IF NOT EXISTS google_integrations (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider                  TEXT NOT NULL DEFAULT 'google_workspace' CHECK (provider IN ('google_workspace')),
    account_email             CITEXT NOT NULL,
    refresh_token_encrypted   TEXT NOT NULL,
    access_token_encrypted    TEXT,
    token_expires_at          TIMESTAMPTZ,
    scopes                    TEXT[] NOT NULL DEFAULT '{}'::text[],
    root_folder_id            TEXT,
    root_folder_name          TEXT,
    connected_by              UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status                    TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'error')),
    last_error                TEXT,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_google_integrations_updated_at ON google_integrations;
CREATE TRIGGER trg_google_integrations_updated_at
    BEFORE UPDATE ON google_integrations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS course_calendar_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id           UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    created_by          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    google_event_id     TEXT NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT,
    starts_at           TIMESTAMPTZ NOT NULL,
    ends_at             TIMESTAMPTZ NOT NULL,
    meet_link           TEXT,
    html_link           TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_generations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id       UUID REFERENCES courses(id) ON DELETE SET NULL,
    generation_type TEXT NOT NULL CHECK (generation_type IN ('lesson_draft', 'quiz_draft', 'video_script', 'google_doc_draft', 'google_slides_draft')),
    model           TEXT NOT NULL,
    locale          CHAR(2) NOT NULL DEFAULT 'es' CHECK (locale IN ('es', 'en')),
    prompt_summary  TEXT NOT NULL,
    output_json     JSONB NOT NULL,
    tokens_used     INT DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Índices clave
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_users_role_status ON users (role, status);
CREATE INDEX IF NOT EXISTS idx_users_teachers_video_enabled ON users (video_editor_enabled) WHERE role = 'teacher';
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_invite_token_hash ON users (invite_token_hash) WHERE invite_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_capability_grants_target_created ON capability_grants (target_user_id, capability, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active_user ON user_sessions (user_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_desc ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON audit_logs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_portal_action_created ON audit_logs (portal_context, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_created ON audit_logs (resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_metadata_gin ON audit_logs USING GIN (metadata jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_courses_status_created ON courses (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_courses_title_es_trgm ON courses USING GIN (title_es gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_courses_title_en_trgm ON courses USING GIN (title_en gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_course_teachers_teacher ON course_teachers (teacher_id, course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_module_published ON lessons (module_id, is_published, sort_order);
CREATE INDEX IF NOT EXISTS idx_lesson_resources_lesson ON lesson_resources (lesson_id);
CREATE INDEX IF NOT EXISTS idx_video_projects_owner_updated ON video_projects (owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_assets_owner_status ON video_assets (owner_id, status);
CREATE INDEX IF NOT EXISTS idx_video_jobs_asset_created ON video_jobs (video_asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_jobs_active_queue ON video_jobs (status, created_at) WHERE status IN ('queued', 'active');
CREATE INDEX IF NOT EXISTS idx_enrollments_course_status ON enrollments (course_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_enrolled ON enrollments (student_id, enrolled_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_discussions_lookup ON course_discussions (course_id, lesson_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_direct_messages_inbox ON direct_messages (recipient_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assessments_course_published ON assessments (course_id, is_published);
CREATE INDEX IF NOT EXISTS idx_assessment_submissions_student ON assessment_submissions (student_id, assessment_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_certificates_student_issued ON certificates (student_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_outbox_dispatch_pending ON email_outbox (status, scheduled_at) WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_notifications_unread_inbox ON notifications (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_calendar_events_course ON course_calendar_events (course_id, starts_at);

-- ============================================================================
-- Blindaje inmutable append-only para audit_logs y capability_grants
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'Violación de inmutabilidad en %.%: operación % prohibida sobre registros de auditoría.',
        TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP
        USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable_row ON audit_logs;
CREATE TRIGGER trg_audit_logs_immutable_row
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

DROP TRIGGER IF EXISTS trg_audit_logs_immutable_truncate ON audit_logs;
CREATE TRIGGER trg_audit_logs_immutable_truncate
    BEFORE TRUNCATE ON audit_logs
    FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_log_mutation();

DROP TRIGGER IF EXISTS trg_capability_grants_immutable_row ON capability_grants;
CREATE TRIGGER trg_capability_grants_immutable_row
    BEFORE UPDATE OR DELETE ON capability_grants
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
