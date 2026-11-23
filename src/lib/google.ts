import { google } from "googleapis";
import { getEnv } from "./env";
import { query } from "./db";
import { decryptSecret, encryptSecret } from "./crypto";

export const GOOGLE_INTEGRATION_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/presentations",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/calendar",
];

export function isGoogleOAuthConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET);
}

function createOAuth2Client() {
  const env = getEnv();
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error("Google OAuth client credentials are not configured");
  }
  const redirectUri =
    env.GOOGLE_OAUTH_REDIRECT_URI || `${env.NEXT_PUBLIC_APP_URL}/api/integrations/google/callback`;
  return new google.auth.OAuth2(env.GOOGLE_OAUTH_CLIENT_ID, env.GOOGLE_OAUTH_CLIENT_SECRET, redirectUri);
}

export function buildGoogleConsentUrl(state: string): string {
  const oauth2 = createOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_INTEGRATION_SCOPES,
    state,
  });
}

export async function saveGoogleOAuthTokens(code: string, connectedByUserId: string) {
  const oauth2 = createOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token && !tokens.access_token) {
    throw new Error("Google OAuth did not return usable tokens");
  }
  oauth2.setCredentials(tokens);

  const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
  const userInfo = await oauth2Api.userinfo.get();
  const accountEmail = userInfo.data.email || "connected-google-account";

  const refreshEnc = tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null;
  const accessEnc = tokens.access_token ? encryptSecret(tokens.access_token) : null;
  const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

  const existing = await query<{ id: string; refresh_token_encrypted: string }>(
    `SELECT id, refresh_token_encrypted FROM google_integrations WHERE provider = 'google_workspace' LIMIT 1`
  );

  if (existing.rows[0]) {
    await query(
      `UPDATE google_integrations
       SET account_email = $2,
           refresh_token_encrypted = COALESCE($3, refresh_token_encrypted),
           access_token_encrypted = $4,
           token_expires_at = $5,
           scopes = $6,
           connected_by = $7,
           status = 'active',
           last_error = NULL
       WHERE id = $1`,
      [
        existing.rows[0].id,
        accountEmail,
        refreshEnc,
        accessEnc,
        expiresAt,
        GOOGLE_INTEGRATION_SCOPES,
        connectedByUserId,
      ]
    );
  } else {
    if (!refreshEnc) {
      throw new Error("Missing refresh_token on initial Google OAuth connection");
    }
    await query(
      `INSERT INTO google_integrations (
         provider, account_email, refresh_token_encrypted, access_token_encrypted,
         token_expires_at, scopes, connected_by, status
       ) VALUES ('google_workspace', $1, $2, $3, $4, $5, $6, 'active')`,
      [
        accountEmail,
        refreshEnc,
        accessEnc,
        expiresAt,
        GOOGLE_INTEGRATION_SCOPES,
        connectedByUserId,
      ]
    );
  }

  return { accountEmail };
}

export async function getActiveGoogleIntegration() {
  const res = await query<{
    id: string;
    account_email: string;
    refresh_token_encrypted: string;
    access_token_encrypted: string | null;
    token_expires_at: Date | null;
    root_folder_id: string | null;
    root_folder_name: string | null;
    status: string;
  }>(
    `SELECT id, account_email, refresh_token_encrypted, access_token_encrypted,
            token_expires_at, root_folder_id, root_folder_name, status
     FROM google_integrations
     WHERE provider = 'google_workspace' AND status = 'active'
     LIMIT 1`
  );
  return res.rows[0] ?? null;
}

export async function getAuthorizedGoogleAuth() {
  const integration = await getActiveGoogleIntegration();
  if (!integration) {
    throw new Error("No active Google Workspace / Drive integration connected in /admin/resources");
  }

  const oauth2 = createOAuth2Client();
  const refreshToken = decryptSecret(integration.refresh_token_encrypted);
  const accessToken = integration.access_token_encrypted
    ? decryptSecret(integration.access_token_encrypted)
    : undefined;

  oauth2.setCredentials({
    refresh_token: refreshToken,
    access_token: accessToken,
    expiry_date: integration.token_expires_at?.getTime(),
  });

  oauth2.on("tokens", async (newTokens) => {
    if (newTokens.access_token) {
      await query(
        `UPDATE google_integrations
         SET access_token_encrypted = $2, token_expires_at = $3
         WHERE id = $1`,
        [
          integration.id,
          encryptSecret(newTokens.access_token),
          newTokens.expiry_date ? new Date(newTokens.expiry_date) : null,
        ]
      ).catch(() => undefined);
    }
  });

  return { oauth2, integration };
}

export async function listGoogleDriveFiles(params: { folderId?: string; queryText?: string } = {}) {
  const { oauth2, integration } = await getAuthorizedGoogleAuth();
  const drive = google.drive({ version: "v3", auth: oauth2 });

  const filters = ["trashed = false"];
  const targetFolder = params.folderId || integration.root_folder_id;
  if (targetFolder) {
    filters.push(`'${targetFolder.replace(/'/g, "\\'")}' in parents`);
  }
  if (params.queryText?.trim()) {
    filters.push(`name contains '${params.queryText.trim().replace(/'/g, "\\'")}'`);
  }

  const res = await drive.files.list({
    q: filters.join(" and "),
    pageSize: 40,
    fields: "files(id, name, mimeType, size, webViewLink, modifiedTime, iconLink)",
    orderBy: "folder,modifiedTime desc",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return res.data.files ?? [];
}

export async function downloadGoogleDriveFile(fileId: string): Promise<{
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  webViewLink?: string | null;
}> {
  const { oauth2 } = await getAuthorizedGoogleAuth();
  const drive = google.drive({ version: "v3", auth: oauth2 });

  const meta = await drive.files.get({
    fileId,
    fields: "id, name, mimeType, webViewLink",
    supportsAllDrives: true,
  });

  const name = meta.data.name || `drive-${fileId}`;
  const mimeType = meta.data.mimeType || "application/octet-stream";

  // Google Workspace native files must be exported
  if (mimeType === "application/vnd.google-apps.document" || mimeType === "application/vnd.google-apps.presentation") {
    const exported = await drive.files.export(
      { fileId, mimeType: "application/pdf" },
      { responseType: "arraybuffer" }
    );
    return {
      buffer: Buffer.from(exported.data as ArrayBuffer),
      fileName: `${name}.pdf`,
      mimeType: "application/pdf",
      webViewLink: meta.data.webViewLink,
    };
  }

  if (mimeType === "application/vnd.google-apps.spreadsheet") {
    const exported = await drive.files.export(
      { fileId, mimeType: "text/csv" },
      { responseType: "arraybuffer" }
    );
    return {
      buffer: Buffer.from(exported.data as ArrayBuffer),
      fileName: `${name}.csv`,
      mimeType: "text/csv",
      webViewLink: meta.data.webViewLink,
    };
  }

  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  );

  return {
    buffer: Buffer.from(res.data as ArrayBuffer),
    fileName: name,
    mimeType,
    webViewLink: meta.data.webViewLink,
  };
}

export async function createGoogleDoc(params: { title: string; bodyText: string }) {
  const { oauth2, integration } = await getAuthorizedGoogleAuth();
  const docs = google.docs({ version: "v1", auth: oauth2 });
  const drive = google.drive({ version: "v3", auth: oauth2 });

  const created = await docs.documents.create({
    requestBody: { title: params.title },
  });
  const documentId = created.data.documentId!;

  if (params.bodyText.trim()) {
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [{ insertText: { location: { index: 1 }, text: params.bodyText } }],
      },
    });
  }

  if (integration.root_folder_id) {
    await drive.files.update({
      fileId: documentId,
      addParents: integration.root_folder_id,
      fields: "id, webViewLink",
      supportsAllDrives: true,
    });
  }

  const fileMeta = await drive.files.get({
    fileId: documentId,
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });

  return {
    fileId: documentId,
    webViewLink: fileMeta.data.webViewLink || `https://docs.google.com/document/d/${documentId}/edit`,
  };
}

export async function createGoogleSlides(params: {
  title: string;
  slides: { heading: string; bullets: string[] }[];
}) {
  const { oauth2, integration } = await getAuthorizedGoogleAuth();
  const slidesApi = google.slides({ version: "v1", auth: oauth2 });
  const drive = google.drive({ version: "v3", auth: oauth2 });

  const created = await slidesApi.presentations.create({
    requestBody: { title: params.title },
  });
  const presentationId = created.data.presentationId!;

  const requests: Record<string, unknown>[] = [];
  params.slides.forEach((slide, idx) => {
    const slideId = `frateli_slide_${idx}`;
    const titleBoxId = `frateli_title_${idx}`;
    const bodyBoxId = `frateli_body_${idx}`;

    requests.push({
      createSlide: {
        objectId: slideId,
        slideLayoutReference: { predefinedLayout: "TITLE_AND_BODY" },
        placeholderIdMappings: [
          { layoutPlaceholder: { type: "TITLE", index: 0 }, objectId: titleBoxId },
          { layoutPlaceholder: { type: "BODY", index: 0 }, objectId: bodyBoxId },
        ],
      },
    });
    requests.push({ insertText: { objectId: titleBoxId, text: slide.heading } });
    requests.push({ insertText: { objectId: bodyBoxId, text: slide.bullets.map((b) => `• ${b}`).join("\n") } });
  });

  if (requests.length > 0) {
    await slidesApi.presentations.batchUpdate({
      presentationId,
      requestBody: { requests: requests as never },
    });
  }

  if (integration.root_folder_id) {
    await drive.files.update({
      fileId: presentationId,
      addParents: integration.root_folder_id,
      supportsAllDrives: true,
    });
  }

  return {
    fileId: presentationId,
    webViewLink: `https://docs.google.com/presentation/d/${presentationId}/edit`,
  };
}

export async function createGoogleSheet(params: {
  title: string;
  headers: string[];
  rows: string[][];
}) {
  const { oauth2, integration } = await getAuthorizedGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth: oauth2 });
  const drive = google.drive({ version: "v3", auth: oauth2 });

  const created = await sheets.spreadsheets.create({
    requestBody: { properties: { title: params.title } },
  });
  const spreadsheetId = created.data.spreadsheetId!;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "A1",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [params.headers, ...params.rows],
    },
  });

  if (integration.root_folder_id) {
    await drive.files.update({
      fileId: spreadsheetId,
      addParents: integration.root_folder_id,
      supportsAllDrives: true,
    });
  }

  return {
    fileId: spreadsheetId,
    webViewLink: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  };
}

export async function createGoogleCalendarSession(params: {
  summary: string;
  description?: string;
  startIso: string;
  endIso: string;
}) {
  const { oauth2 } = await getAuthorizedGoogleAuth();
  const calendar = google.calendar({ version: "v3", auth: oauth2 });

  const created = await calendar.events.insert({
    calendarId: "primary",
    conferenceDataVersion: 1,
    requestBody: {
      summary: params.summary,
      description: params.description,
      start: { dateTime: params.startIso },
      end: { dateTime: params.endIso },
      conferenceData: {
        createRequest: {
          requestId: `frateli-${Date.now()}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    },
  });

  return {
    googleEventId: created.data.id!,
    htmlLink: created.data.htmlLink || null,
    meetLink: created.data.hangoutLink || null,
  };
}
