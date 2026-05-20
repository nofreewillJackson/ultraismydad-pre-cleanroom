export function GET() {
  return new Response(
`User-agent: *
Allow: /

Sitemap: https://artlu.ai/sitemap-index.xml
`,
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}
