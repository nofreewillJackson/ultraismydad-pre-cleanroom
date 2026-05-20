// Bundles the standalone astro-*-view.html mockups into one self-contained
// file (artlu-rebuild.html) so it can be embedded in a single tracker iframe.
// Each view is stored verbatim inside a <script type="text/html"> block and
// loaded into a shell iframe via srcdoc. Cross-file nav (location.href) is
// rewritten to call the shell router.
const fs = require('fs');
const path = require('path');
const dir = __dirname;

const VIEWS = {
  stack:    'astro-stack-view.html',
  map:      'astro-map-view.html',
  list:     'astro-list-view.html',
  log:      'astro-log-view.html',
  research: 'astro-research-view.html',
  video:    'astro-video-view.html',
};

// astro-*.html file -> internal view name
const NAV = {
  'astro-list-view.html': 'list',
  'astro-map-view.html': 'map',
  'astro-stack-view.html': 'stack',
  'astro-log-view.html': 'log',
  'astro-research-view.html': 'research',
  'astro-video-view.html': 'video',
};

// sentinel that stands in for the literal "</script" so a full HTML document
// can nest inside a <script type="text/html"> block without closing it early.
const SENTINEL = '@@ENDSCRIPT@@';

function transform(src) {
  let s = src;
  // page navigation -> shell router
  for (const [file, name] of Object.entries(NAV)) {
    s = s.split("location.href='" + file + "'")
         .join("(parent.nav||function(){})('" + name + "')");
  }
  // artlu.ai project preview pointed at a sibling file -> fall back to favicon tile
  s = s.split("demo:'astro-stack-view.html'").join("demo:''");
  // neutralise every "</script" so the parser keeps the whole doc as text
  s = s.split('</script').join(SENTINEL);
  return s;
}

let blocks = '';
for (const [name, file] of Object.entries(VIEWS)) {
  const raw = fs.readFileSync(path.join(dir, file), 'utf8');
  blocks += '<script type="text/html" id="v-' + name + '">\n'
          + transform(raw) + '\n</script>\n';
}

const shell = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>artlu.ai — rebuild mockup</title>
<style>
  html,body{margin:0;padding:0;background:#08090a}
  #frame{display:block;width:100%;height:100vh;border:0}
</style>
</head>
<body>
<iframe id="frame" title="artlu.ai rebuild mockup" allow="fullscreen"></iframe>
${blocks}<script>
  var frame = document.getElementById('frame');
  var requested = 'stack';  // the view the user picked
  var current = null;       // the view actually shown (may differ on mobile)
  var END = '<' + '/script';
  function viewSrc(name){
    var el = document.getElementById('v-' + name);
    return el ? el.textContent.split('${SENTINEL}').join(END) : '';
  }
  function small(){ return window.innerWidth < 720; }
  function render(){
    var name = requested;
    // mobile fallback: the pan/zoom canvas views drop to the list view
    if(small() && (name==='map' || name==='stack')) name = 'list';
    if(name === current) return;
    current = name;
    frame.srcdoc = viewSrc(name);
  }
  function nav(name){
    if(!document.getElementById('v-' + name)) name = 'stack';
    requested = name;
    render();
  }
  window.nav = nav;
  window.addEventListener('resize', render);
  try { if(localStorage.getItem('artlu-theme')==='light') document.body.style.background='#e9eaec'; } catch(e){}
  nav('stack');
</script>
</body>
</html>`;

const out = path.join(dir, 'artlu-rebuild.html');
fs.writeFileSync(out, shell);
console.log('wrote', out, (shell.length / 1024).toFixed(1) + 'KB');
