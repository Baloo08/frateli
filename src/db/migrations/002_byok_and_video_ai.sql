-- ============================================================================
-- Frateli LMS — Migración 002: Superadmin BYOK Gemini + Apoyo Napkin + Prácticas
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_ai_configs (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider           TEXT NOT NULL UNIQUE DEFAULT 'gemini' CHECK (provider IN ('gemini')),
    api_key_encrypted  TEXT NOT NULL,
    key_hint           TEXT NOT NULL,
    text_model         TEXT NOT NULL DEFAULT 'gemini-3.8-flash',
    image_model        TEXT NOT NULL DEFAULT 'gemini-nano-banana-2.1',
    is_active          BOOLEAN NOT NULL DEFAULT true,
    updated_by         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_system_ai_configs_updated_at ON system_ai_configs;
CREATE TRIGGER trg_system_ai_configs_updated_at
    BEFORE UPDATE ON system_ai_configs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE lessons
    ADD COLUMN IF NOT EXISTS support_md_es TEXT,
    ADD COLUMN IF NOT EXISTS support_md_en TEXT,
    ADD COLUMN IF NOT EXISTS visual_aids_json JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE assessments
    ADD COLUMN IF NOT EXISTS assessment_type TEXT NOT NULL DEFAULT 'graded'
        CHECK (assessment_type IN ('graded', 'practice')),
    ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assessments_lesson_id ON assessments (lesson_id) WHERE lesson_id IS NOT NULL;

ALTER TABLE ai_generations
    DROP CONSTRAINT IF EXISTS ai_generations_generation_type_check;

ALTER TABLE ai_generations
    ADD CONSTRAINT ai_generations_generation_type_check
        CHECK (generation_type IN (
            'lesson_draft',
            'quiz_draft',
            'video_script',
            'google_doc_draft',
            'google_slides_draft',
            'video_support_pack',
            'video_practice_pack'
        ));
