import type { Project } from "./data";
import { slugify } from "./format";

const legacyProjectRefAliases: Record<string, string> = {
  "snapshot - public webapp": "snapshot-public-web-app-for-site-freezing",
  "site snapshot — claude skill for frozen html mockups": "claude-skill-for-website-snapshots",
  "artlu.ai v3 rebuild — mobile stack view": "mobile-stack-view-mockup-artlu-ai-v3",
  "x-queue (xqboost)": "tweet-queue-draft-management-xqboost",
  "xqboost part 2 — ai brain + ui reskin": "ai-personality-tweet-generator-xqboost",
  "xqboost": "ai-personality-tweet-generator-xqboost",
  "featured projects + tag pool — artlu.ai v3": "featured-projects-tag-pool-artlu-ai",
};

const refKey = (value: string) => String(value || "").trim().toLowerCase();

export function createProjectRefResolver(projects: Project[]) {
  const projectRefIndex = new Map<string, Project>();
  projects.forEach((project) => {
    [project.id, project.slug, project.name, slugify(project.name)].filter(Boolean).forEach((value) => {
      projectRefIndex.set(refKey(value), project);
    });
  });

  return function resolveProjectRef(ref: string) {
    const label = String(ref || "");
    const alias = legacyProjectRefAliases[refKey(label)];
    const project = projectRefIndex.get(refKey(alias || "")) || projectRefIndex.get(refKey(label)) || projectRefIndex.get(refKey(slugify(label)));
    return { label: project?.name || label, href: project ? `/project/${project.slug}` : "" };
  };
}
