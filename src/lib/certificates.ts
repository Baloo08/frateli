import crypto from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { query } from "./db";
import { buildCertificateHash, generateVerificationCode } from "./crypto";
import { getEnv } from "./env";
import { putObject } from "./storage";
import { enqueueEmail } from "./email";

export async function issueCertificateForEnrollment(enrollmentId: string) {
  const existing = await query<{ id: string; verification_code: string }>(
    `SELECT id, verification_code FROM certificates WHERE enrollment_id = $1 LIMIT 1`,
    [enrollmentId]
  );
  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const infoRes = await query<{
    enrollment_id: string;
    student_id: string;
    student_name: string;
    student_email: string;
    preferred_locale: "es" | "en";
    course_id: string;
    course_title_es: string;
    course_title_en: string;
    passing_grade_pct: string;
    final_grade_pct: string | null;
    progress_pct: string;
  }>(
    `SELECT e.id AS enrollment_id,
            u.id AS student_id,
            u.full_name AS student_name,
            u.email AS student_email,
            u.preferred_locale,
            c.id AS course_id,
            c.title_es AS course_title_es,
            c.title_en AS course_title_en,
            c.passing_grade_pct::text,
            e.final_grade_pct::text,
            e.progress_pct::text
     FROM enrollments e
     JOIN users u ON u.id = e.student_id
     JOIN courses c ON c.id = e.course_id
     WHERE e.id = $1`,
    [enrollmentId]
  );

  const info = infoRes.rows[0];
  if (!info) throw new Error("Enrollment not found");

  const teacherRes = await query<{ full_name: string }>(
    `SELECT u.full_name
     FROM course_teachers ct
     JOIN users u ON u.id = ct.teacher_id
     WHERE ct.course_id = $1
     ORDER BY ct.is_primary DESC, ct.assigned_at ASC
     LIMIT 1`,
    [info.course_id]
  );
  const teacherName = teacherRes.rows[0]?.full_name || "Frateli Faculty";

  const certificateId = crypto.randomUUID();
  const verificationCode = generateVerificationCode();
  const issuedAt = new Date().toISOString();
  const gradeFormatted = Number(info.final_grade_pct ?? 100).toFixed(2);

  const verificationHash = buildCertificateHash({
    certificateId,
    courseId: info.course_id,
    finalGradePct: gradeFormatted,
    issuedAt,
    studentId: info.student_id,
  });

  const appUrl = getEnv().NEXT_PUBLIC_APP_URL;
  const verifyUrl = `${appUrl}/verify/${verificationCode}`;
  const qrBuffer = await QRCode.toBuffer(verifyUrl, { width: 180, margin: 1 });

  // Build landscape A4 PDF with pdf-lib
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Frateli Certificate - ${info.student_name}`);
  pdfDoc.setAuthor("Frateli Campus Virtual");
  pdfDoc.setSubject(info.course_title_es);

  const page = pdfDoc.addPage([841.89, 595.28]);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Border and header accent
  page.drawRectangle({
    x: 24,
    y: 24,
    width: 793.89,
    height: 547.28,
    borderColor: rgb(0.11, 0.31, 0.85),
    borderWidth: 3,
    color: rgb(0.98, 0.99, 1),
  });

  page.drawText("FRATELI CAMPUS VIRTUAL", {
    x: 60,
    y: 515,
    size: 14,
    font: fontBold,
    color: rgb(0.11, 0.31, 0.85),
  });

  const isEs = info.preferred_locale === "es";
  page.drawText(
    isEs ? "CERTIFICADO DE FINALIZACIÓN" : "CERTIFICATE OF COMPLETION",
    { x: 60, y: 455, size: 30, font: fontBold, color: rgb(0.06, 0.09, 0.16) }
  );

  page.drawText(
    isEs ? "Se otorga el presente certificado a:" : "This certificate is awarded to:",
    { x: 60, y: 405, size: 14, font: fontRegular, color: rgb(0.28, 0.33, 0.41) }
  );

  page.drawText(info.student_name, {
    x: 60,
    y: 358,
    size: 28,
    font: fontBold,
    color: rgb(0.06, 0.09, 0.16),
  });

  const courseTitle = isEs ? info.course_title_es : info.course_title_en;
  page.drawText(
    isEs
      ? `Por completar satisfactoriamente el curso: ${courseTitle}`
      : `For successfully completing the course: ${courseTitle}`,
    { x: 60, y: 305, size: 15, font: fontRegular, color: rgb(0.12, 0.16, 0.23), maxWidth: 680 }
  );

  page.drawText(
    `${isEs ? "Calificación final" : "Final grade"}: ${gradeFormatted}%  |  ${
      isEs ? "Docente" : "Instructor"
    }: ${teacherName}`,
    { x: 60, y: 255, size: 13, font: fontRegular, color: rgb(0.28, 0.33, 0.41) }
  );

  page.drawText(
    `${isEs ? "Código de verificación" : "Verification code"}: ${verificationCode}`,
    { x: 60, y: 120, size: 12, font: fontBold, color: rgb(0.06, 0.09, 0.16) }
  );

  page.drawText(verifyUrl, {
    x: 60,
    y: 98,
    size: 10,
    font: fontRegular,
    color: rgb(0.11, 0.31, 0.85),
  });

  page.drawText(`SHA-256: ${verificationHash}`, {
    x: 60,
    y: 76,
    size: 8.5,
    font: fontRegular,
    color: rgb(0.39, 0.45, 0.55),
  });

  const qrImage = await pdfDoc.embedPng(qrBuffer);
  page.drawImage(qrImage, { x: 650, y: 65, width: 120, height: 120 });

  const pdfBytes = await pdfDoc.save();
  const storageKey = `certs/${certificateId}.pdf`;
  await putObject(storageKey, pdfBytes, "application/pdf");

  const snapshot = {
    student_full_name: info.student_name,
    course_title_es: info.course_title_es,
    course_title_en: info.course_title_en,
    primary_teacher_name: teacherName,
    final_grade_pct: Number(gradeFormatted),
    passing_grade_pct: Number(info.passing_grade_pct),
    issued_locale: info.preferred_locale,
  };

  await query(
    `INSERT INTO certificates (
       id, enrollment_id, student_id, course_id, verification_code,
       verification_hash, metadata_snapshot, pdf_storage_key, issued_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      certificateId,
      info.enrollment_id,
      info.student_id,
      info.course_id,
      verificationCode,
      verificationHash,
      JSON.stringify(snapshot),
      storageKey,
      issuedAt,
    ]
  );

  await enqueueEmail({
    recipientUserId: info.student_id,
    recipientEmail: info.student_email,
    templateKey: "certificate_issued",
    locale: info.preferred_locale,
    payload: {
      fullName: info.student_name,
      courseTitle,
      verificationCode,
      verifyUrl,
    },
  }).catch(() => undefined);

  return { id: certificateId, verification_code: verificationCode };
}
