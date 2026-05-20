import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../lib/theme";

// Hosts we trust to allow iframe embedding (mirrors ProjectDetail.jsx)
const EMBEDDABLE_HOSTS = [
  "netlify.app", "vercel.app", "github.io",
  "pages.dev", "netlify.com", "render.com", "railway.app",
  "fly.dev", "surge.sh",
  // Manus default hosting subdomains
  "manus.computer", "manuspre.computer", "manus-asia.computer",
  "manuscomputer.ai", "manusvm.computer",
  // Custom domains for Manus-hosted projects
  "adsmetri.com",
];
const NON_EMBEDDABLE_HOSTS = [
  "github.com", "youtube.com", "youtu.be", "loom.com",
  "screen.studio", "twitter.com", "x.com", "linkedin.com",
  "notion.so", "drive.google.com", "docs.google.com",
];
function isEmbeddableUrl(url) {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    if (NON_EMBEDDABLE_HOSTS.some(d => hostname.includes(d))) return false;
    return EMBEDDABLE_HOSTS.some(d => hostname.includes(d));
  } catch { return false; }
}

export default function FeaturedCard({ project }) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [hover, setHover] = useState(false);
  const tags = (project.tags || []).filter(Boolean).slice(0, 2);
  const thumb = (project.screenshots || [])[0];
  const hasArtifact = !!project.artifactHtml?.trim();
  const embeddableLink = !hasArtifact && isEmbeddableUrl(project.link) ? project.link : null;

  const goToDetail = () => {
    const slug = project.slug || project.id;
    navigate(`/project/${slug}`);
  };

  const shellStyle = {
    ...(isDark ? S.cardDark : S.cardLight),
    ...(hover ? (isDark ? S.cardHoverDark : S.cardHoverLight) : {}),
  };

  return (
    <div
      style={shellStyle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Preview slot — live iframe (artifactHtml or embeddable link), thumbnail, or $_ placeholder */}
      <div style={S.preview}>
        {hasArtifact ? (
          <>
            <iframe
              srcDoc={project.artifactHtml}
              sandbox="allow-scripts allow-forms"
              title={project.name}
              style={S.iframe}
            />
            <button
              onClick={(e) => { e.stopPropagation(); goToDetail(); }}
              style={S.openFull}
              title="open in full page"
            >↗</button>
          </>
        ) : embeddableLink ? (
          <>
            <iframe
              src={embeddableLink}
              sandbox="allow-scripts allow-same-origin allow-forms"
              title={project.name}
              style={S.iframe}
              loading="lazy"
            />
            <button
              onClick={(e) => { e.stopPropagation(); goToDetail(); }}
              style={S.openFull}
              title="open in full page"
            >↗</button>
          </>
        ) : thumb ? (
          <img
            src={thumb}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "pointer" }}
            onClick={goToDetail}
          />
        ) : (
          <div
            onClick={goToDetail}
            style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <span style={S.previewIcon}>$_</span>
          </div>
        )}
      </div>

      {/* Body — always clickable, navigates to detail */}
      <div style={S.body} onClick={goToDetail}>
        {tags.length > 0 && (
          <div style={S.tagRow}>
            {tags.map(t => <span key={t} style={S.tag}>{t}</span>)}
          </div>
        )}
        <div style={isDark ? S.titleDark : S.titleLight}>{project.name}</div>
        {project.desc && <div style={isDark ? S.descDark : S.descLight}>{project.desc}</div>}
        <div style={S.cta}>open page ↗</div>
      </div>
    </div>
  );
}

const S = {
  cardLight: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--shadow-card)",
    overflow: "hidden",
    display: "flex", flexDirection: "column",
    transition: "box-shadow 0.15s, transform 0.15s",
  },
  cardHoverLight: {
    boxShadow: "var(--shadow-card-hover)",
    transform: "translateY(-1px)",
  },
  cardDark: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    overflow: "hidden",
    display: "flex", flexDirection: "column",
    transition: "border-color 0.15s",
  },
  cardHoverDark: {
    borderColor: "var(--green-border)",
  },

  preview: {
    aspectRatio: "9 / 16",
    background: "var(--surface-2)",
    borderBottom: "1px solid var(--divider)",
    position: "relative",
    overflow: "hidden",
    width: "100%",
  },
  iframe: {
    border: 0,
    width: "100%",
    height: "100%",
    display: "block",
    background: "#fff",
  },
  openFull: {
    position: "absolute",
    top: 8, right: 8,
    width: 26, height: 26,
    borderRadius: 6,
    background: "rgba(255,255,255,0.9)",
    border: "1px solid var(--border)",
    color: "var(--text-sub)",
    fontSize: 12,
    cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
    transition: "color 0.15s, border-color 0.15s",
    zIndex: 2,
  },
  previewIcon: {
    fontFamily: "var(--font-mono)",
    fontSize: 22,
    color: "var(--dim)",
    opacity: 0.6,
  },

  body: {
    padding: "14px 16px 16px",
    display: "flex", flexDirection: "column", gap: 6,
    flex: 1,
    cursor: "pointer",
  },

  tagRow: { display: "flex", gap: 4, flexWrap: "wrap" },
  tag: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color: "var(--text-sub)",
    background: "var(--surface-2)",
    border: "1px solid var(--divider)",
    padding: "1px 7px",
    borderRadius: "var(--radius-chip)",
    lineHeight: 1.5,
  },

  titleLight: {
    fontFamily: "var(--font)",
    fontSize: 15, fontWeight: 600,
    color: "var(--text-bright)",
    letterSpacing: "-0.01em",
  },
  titleDark: {
    fontFamily: "var(--font-mono)",
    fontSize: 13, fontWeight: 500,
    color: "var(--text-bright)",
  },

  descLight: {
    fontSize: 13, color: "var(--text-sub)", lineHeight: 1.45, flex: 1,
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  descDark: {
    fontSize: 11, color: "var(--text-sub)", lineHeight: 1.5, flex: 1, fontFamily: "var(--font-mono)",
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },

  cta: {
    fontFamily: "var(--font-mono)",
    fontSize: 11, color: "var(--green)",
    fontWeight: 500,
    marginTop: 4,
  },
};
