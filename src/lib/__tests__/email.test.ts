import { describe, expect, it } from "vitest";
import { renderEmailTemplate } from "../email";

describe("bilingual accessible email templates", () => {
  it("renders invite_teacher in Spanish and English", () => {
    const es = renderEmailTemplate("invite_teacher", "es", {
      fullName: "Ana Pérez",
      inviteUrl: "https://campus.frateli.edu/invite/abc",
    });
    expect(es.subject).toContain("Invitación");
    expect(es.html).toContain('<html lang="es">');
    expect(es.html).toContain("https://campus.frateli.edu/invite/abc");

    const en = renderEmailTemplate("invite_teacher", "en", {
      fullName: "Ana Pérez",
      inviteUrl: "https://campus.frateli.edu/invite/abc",
    });
    expect(en.subject).toContain("invitation");
    expect(en.html).toContain('<html lang="en">');
  });

  it("renders video_studio_enabled with reason", () => {
    const msg = renderEmailTemplate("video_studio_enabled", "es", {
      fullName: "Carlos",
      reason: "Autorizado para módulo 1",
    });
    expect(msg.html).toContain("Autorizado para módulo 1");
  });
});
