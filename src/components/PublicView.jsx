import { useState, useEffect } from "react";
import { subscribeToPublicProjects } from "../lib/db";
import { useTheme } from "../lib/theme";
import Header from "./Header";
import ProjectTable from "./ProjectTable";
import ActivityCard from "./ActivityCard";
import FeaturedGrid from "./FeaturedGrid";
import VideoShowcase from "./VideoShowcase";

const START_DATE = "2026-03-18";

function useWidth() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

function dayNum() {
  const start = new Date(START_DATE + "T00:00:00");
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.max(1, Math.min(Math.floor((now - start) / 86400000) + 1, 100));
}

function sortProjects(arr) {
  return [...arr].sort((a, b) => {
    const da = new Date(a.date || a.createdAt?.toDate?.() || "2000-01-01");
    const db = new Date(b.date || b.createdAt?.toDate?.() || "2000-01-01");
    if (db - da !== 0) return db - da;
    return (a.sortOrder || 0) - (b.sortOrder || 0);
  });
}

export default function PublicView() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const width = useWidth();
  const narrowHero = width < 960;
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTag, setActiveTag] = useState("all");

  useEffect(() => {
    // Live Firestore listener — public projects update in place without reload.
    const unsubscribe = subscribeToPublicProjects(
      (data) => { setProjects(data); setLoading(false); },
      (err) => { setError("failed to load: " + err.message); setLoading(false); }
    );
    return unsubscribe;
  }, []);

  const sorted = sortProjects(projects);

  const allTags = [...new Set(sorted.flatMap(p => (p.tags || []).filter(Boolean)))].sort();

  const filtered = activeTag === "all"
    ? sorted
    : activeTag === "top"
    ? sorted.filter(p => p.top)
    : sorted.filter(p => (p.tags || []).includes(activeTag));

  const launched = projects.filter(p => p.status === "launched").length;
  const day = dayNum();
  const toGo = Math.max(0, 100 - projects.length);

  return (
    <div style={S.wrap}>
      <Header projectCount={projects.length} launchedCount={launched} publicCount={projects.length} isPublic={true} />
      {error && <div style={{ color: "var(--red)", fontSize: 11, marginBottom: 10 }}>{error}</div>}

      {/* Hero / page header — snaps to the same 4-col grid as the showcase sections below */}
      <div style={{ ...S.pageHeader, gridTemplateColumns: narrowHero ? "1fr" : "repeat(4, minmax(0, 1fr))" }}>
        <div style={{ ...S.pageHeaderLeft, gridColumn: narrowHero ? "auto" : "span 3", maxWidth: narrowHero ? "none" : "none" }}>
          <div style={S.eyebrow}>
            <span style={S.eyebrowDot} />
            day {day} of 100 · live build
          </div>
          <div style={isDark ? S.titleDark : S.titleLight}>
            {isDark ? (
              <>
                <span style={{ color: "var(--green)" }}>100</span> projects.{" "}
                <span style={{ color: "var(--green)" }}>100</span> days.
              </>
            ) : (
              "100 projects. 100 days."
            )}
          </div>
          <div style={isDark ? S.subDark : S.subLight}>
            Just AI and an internet connection.
          </div>
          <div style={S.counter}>
            day <strong style={S.counterStrong}>{day}</strong>/100 ·{" "}
            <strong style={S.counterStrong}>{launched}</strong> shipped ·{" "}
            <strong style={S.counterStrong}>{toGo}</strong> to go
          </div>
        </div>

        {!loading && projects.length > 0 && (
          <div style={{ ...S.pageHeaderRight, gridColumn: narrowHero ? "auto" : "span 1" }}>
            <ActivityCard projects={projects} />
          </div>
        )}
      </div>

      {/* Video showcase — shipped videos with per-video guidebook pages */}
      <VideoShowcase />

      {/* Demo showcase — live embeds (formerly "showcase demos") */}
      {!loading && <FeaturedGrid projects={sorted} totalProjectCount={projects.length} />}

      {/* All projects — section header + filter bar + table */}
      {allTags.length > 0 && !loading && (
        <>
          <div style={S.sectionHead}>
            <div style={isDark ? S.sectionTitleDark : S.sectionTitleLight}>all projects</div>
            <div style={S.sectionMeta}>{projects.length} total · sorted by date</div>
          </div>

          <div style={S.filterBar}>
            <span style={S.filterLabel}>filter:</span>
            <button
              style={activeTag === "all" ? S.filterBtnActive : S.filterBtn}
              onClick={() => setActiveTag("all")}
            >all</button>
            <button
              style={activeTag === "top" ? S.filterBtnActive : S.filterBtn}
              onClick={() => setActiveTag("top")}
            >★ top</button>
            {allTags.map(tag => (
              <button
                key={tag}
                style={activeTag === tag ? S.filterBtnActive : S.filterBtn}
                onClick={() => setActiveTag(tag)}
              >{tag}</button>
            ))}
            <span style={S.filterCount}>{filtered.length} project{filtered.length === 1 ? "" : "s"}</span>
          </div>
        </>
      )}

      {loading ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--dim)", fontSize: 11 }}>loading...</div>
      ) : (
        <ProjectTable projects={filtered} isAdmin={false} />
      )}
    </div>
  );
}

const S = {
  wrap: {
    maxWidth: 1280,
    margin: "0 auto",
    padding: "48px 24px 40px",
    minHeight: "100vh",
    boxSizing: "border-box",
  },

  // Hero / page header
  pageHeader: {
    marginBottom: 36,
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 32,
    alignItems: "start",
  },
  pageHeaderLeft: { maxWidth: 560, minWidth: 0 },
  pageHeaderRight: {},

  eyebrow: {
    fontFamily: "var(--font-mono)",
    fontSize: 12, color: "var(--green)",
    marginBottom: 8, fontWeight: 500,
    display: "inline-flex", alignItems: "center", gap: 8,
  },
  eyebrowDot: {
    display: "inline-block", width: 7, height: 7, borderRadius: "50%",
    background: "var(--green)",
    boxShadow: "0 0 0 4px var(--green-bg)",
  },

  titleLight: {
    fontFamily: "var(--font)",
    fontSize: 40, fontWeight: 700, color: "var(--text-bright)",
    letterSpacing: "-0.03em", lineHeight: 1.05, marginBottom: 12,
  },
  titleDark: {
    fontFamily: "var(--font-mono)",
    fontSize: 22, fontWeight: 500, color: "var(--text-bright)",
    letterSpacing: "-0.01em", lineHeight: 1.1, marginBottom: 8,
  },

  subLight: {
    fontFamily: "var(--font-mono)",
    fontSize: 13, color: "var(--text-sub, var(--dim))",
    lineHeight: 1.65, letterSpacing: 0.1, maxWidth: 560,
  },
  subDark: {
    fontFamily: "var(--font-mono)",
    fontSize: 12, color: "var(--text-sub, var(--dim))",
    lineHeight: 1.6, fontWeight: 300, letterSpacing: 0.2,
  },

  counter: {
    fontFamily: "var(--font-mono)",
    fontSize: 13, color: "var(--text-sub, var(--dim))",
    marginTop: 12,
  },
  counterStrong: { color: "var(--green)", fontWeight: 600 },

  // Section head
  sectionHead: {
    display: "flex", alignItems: "baseline", justifyContent: "space-between",
    marginBottom: 12, marginTop: 8,
  },
  sectionTitleLight: {
    fontFamily: "var(--font-mono)",
    fontSize: 13, fontWeight: 600, color: "var(--text-bright)",
    letterSpacing: 0,
  },
  sectionTitleDark: {
    fontFamily: "var(--font-mono)",
    fontSize: 13, fontWeight: 500, color: "var(--text-bright)",
  },
  sectionMeta: {
    fontFamily: "var(--font-mono)",
    fontSize: 11, color: "var(--text-sub, var(--dim))",
  },

  // Filter bar (kept faithful to existing — tag filter style with 'top' button)
  filterBar: {
    display: "flex", alignItems: "center", gap: 6,
    marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid var(--border)",
    flexWrap: "wrap",
  },
  filterLabel: { fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--dimmer)" },
  filterBtn: {
    background: "none", border: "1px solid var(--border)", borderRadius: 3,
    color: "var(--dim)", fontFamily: "var(--font-mono)", fontSize: 10,
    padding: "2px 10px", cursor: "pointer", transition: "all 0.15s",
  },
  filterBtnActive: {
    background: "var(--green-bg)", border: "1px solid var(--green-border)", borderRadius: 3,
    color: "var(--green)", fontFamily: "var(--font-mono)", fontSize: 10,
    padding: "2px 10px", cursor: "pointer",
  },
  filterCount: { fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--dimmer)", marginLeft: 4 },
};
