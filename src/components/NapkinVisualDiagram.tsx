import type { Locale } from "@/i18n";

export interface VisualAidView {
  id: string;
  titleEs: string;
  titleEn: string;
  captionEs: string;
  captionEn: string;
  altEs: string;
  altEn: string;
  diagramKind: "flow" | "pillars" | "cycle";
  imageUrl?: string | null;
  nodes: {
    labelEs: string;
    labelEn: string;
    detailEs: string;
    detailEn: string;
  }[];
}

export function NapkinVisualDiagram({
  aid,
  locale,
}: {
  aid: VisualAidView;
  locale: Locale;
}) {
  const isEs = locale === "es";
  const title = isEs ? aid.titleEs : aid.titleEn;
  const caption = isEs ? aid.captionEs : aid.captionEn;
  const alt = isEs ? aid.altEs || title : aid.altEn || title;

  return (
    <figure
      className="card stack"
      style={{
        margin: 0,
        background: "#FFFFFF",
        color: "#0F172A",
        border: "1.5px solid #CBD5E1",
      }}
    >
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong style={{ fontSize: "1.05rem", color: "#0F172A" }}>{title}</strong>
        <span className="badge" style={{ background: "#EFF6FF", color: "#1D4ED8" }}>
          {aid.diagramKind.toUpperCase()}
        </span>
      </div>

      {aid.imageUrl ? (
        <img
          src={aid.imageUrl}
          alt={alt}
          style={{
            width: "100%",
            maxHeight: "420px",
            objectFit: "contain",
            borderRadius: "8px",
            border: "1px solid #E2E8F0",
            background: "#FFFFFF",
          }}
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: "12px",
            padding: "14px",
            borderRadius: "8px",
            background: "#F8FAFC",
            border: "1px dashed #93C5FD",
          }}
        >
          {aid.nodes.map((node, idx) => (
            <div
              key={idx}
              style={{
                background: "#FFFFFF",
                border: "1.5px solid #1D4ED8",
                borderRadius: "8px",
                padding: "12px",
                position: "relative",
              }}
            >
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  color: "#1D4ED8",
                  marginBottom: "4px",
                }}
              >
                {aid.diagramKind === "flow"
                  ? `${isEs ? "Paso" : "Step"} ${idx + 1}`
                  : aid.diagramKind === "cycle"
                  ? `${isEs ? "Fase" : "Phase"} ${idx + 1}`
                  : `${isEs ? "Pilar" : "Pillar"} ${idx + 1}`}
              </div>
              <div style={{ fontWeight: 700, color: "#0F172A", marginBottom: "4px" }}>
                {isEs ? node.labelEs : node.labelEn}
              </div>
              <div style={{ fontSize: "0.875rem", color: "#334155" }}>
                {isEs ? node.detailEs : node.detailEn}
              </div>
            </div>
          ))}
        </div>
      )}

      {caption && (
        <figcaption style={{ fontSize: "0.9rem", color: "#475569" }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
