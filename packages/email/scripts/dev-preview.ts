/**
 * Shipyard email preview server (dev-only) — replaces react-email's CLI
 * preview (which pins a vulnerable Next.js and cannot run on patched lines).
 *
 * Renders every template in `emails/` with its static PreviewProps via the
 * real render pipeline (@shipyard/email render → html + text), served on
 * :3001 with a minimal review UI. Re-renders on every request — no cache,
 * so editing a template and refreshing shows the change immediately.
 *
 * Run: pnpm emails:dev   (or: pnpm --filter @shipyard/email dev)
 */
import { createServer, type ServerResponse } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { renderEmail } from '../src/index.js';

const PORT = Number(process.env.EMAIL_PREVIEW_PORT ?? 3001);
const EMAILS_DIR = fileURLToPath(new URL('../emails', import.meta.url));
const STATIC_DIR = fileURLToPath(new URL('../emails/static', import.meta.url));

interface TemplateInfo {
  name: string;
  subject: string;
}

type PreviewableComponent = {
  PreviewProps?: unknown;
};

/** filename (kebab) → registry key (camelCase), e.g. password-reset → passwordReset. */
const camelize = (name: string): string =>
  name.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());

async function loadPreviewProps(file: string): Promise<unknown> {
  const mod = (await import(join(EMAILS_DIR, file).replace(/\\/g, '/'))) as {
    default?: PreviewableComponent;
  };
  return mod.default?.PreviewProps;
}

async function listTemplates(): Promise<TemplateInfo[]> {
  const files = (await readdir(EMAILS_DIR)).filter((f) => f.endsWith('.tsx'));
  const out: TemplateInfo[] = [];
  for (const file of files) {
    const name = file.replace(/\.tsx$/, '');
    try {
      const props = await loadPreviewProps(file);
      if (props === undefined) {
        console.warn(`[preview] ${name}: no PreviewProps, skipping`);
        continue;
      }
      const rendered = await renderEmail(
        camelize(name) as never,
        props as never,
      );
      out.push({ name, subject: rendered.subject });
    } catch (error) {
      console.error(`[preview] ${name} failed to render:`, error);
      out.push({ name, subject: '⚠ render error' });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sidebar(templates: TemplateInfo[], active: string | null): string {
  const items = templates
    .map(
      (t) =>
        `<a class="item${t.name === active ? ' active' : ''}" href="/preview/${t.name}">${t.name}<span class="subject">${escapeHtml(t.subject)}</span></a>`,
    )
    .join('');
  return `<h1>Shipyard · emails</h1>${items}`;
}

function page(
  templates: TemplateInfo[],
  active: string | null,
  content: string,
  script = '',
): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Shipyard emails</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; background: #f4f3ef; color: #171717; }
  .side { position: fixed; inset: 0 auto 0 0; width: 240px; background: #171717; color: #f7f4ed; padding: 16px; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; }
  .side h1 { font-size: 15px; margin: 0 0 12px; color: #f59e0b; }
  .item { display: block; padding: 8px 10px; border-radius: 8px; color: #f7f4ed; text-decoration: none; font-size: 13px; }
  .item:hover, .item.active { background: #b45309; }
  .subject { display: block; color: #aaa39a; font-size: 11px; margin-top: 2px; }
  .main { margin-left: 240px; padding: 24px; display: flex; flex-direction: column; align-items: center; }
  .bar { display: flex; gap: 16px; align-items: center; margin-bottom: 16px; font-size: 13px; width: 100%; max-width: 760px; }
  .bar .subject-line { color: #6c6861; }
  .frame { width: 760px; max-width: 100%; height: 600px; border: 1px solid #dedcd5; border-radius: 12px; background: #fff; }
  .width-toggle { margin-left: auto; display: flex; gap: 4px; }
  .width-toggle button { border: 1px solid #dedcd5; background: #fff; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 12px; }
  .width-toggle button.active { background: #b45309; color: #fff; border-color: #b45309; }
  .error { color: #b42318; }
</style></head>
<body><nav class="side">${sidebar(templates, active)}</nav><main class="main">${content}</main>${script}</body></html>`;
}

const WIDTH_SCRIPT = `
<script>
  const frame = document.getElementById('frame');
  // Fit the iframe height to the email content — no inner scrollbar.
  const fit = () => {
    const doc = frame.contentDocument;
    if (doc && doc.body) {
      frame.style.height = Math.max(doc.body.scrollHeight, 300) + 'px';
    }
  };
  frame.addEventListener('load', fit);
  fit();
  document.querySelectorAll('.width-toggle button').forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelectorAll('.width-toggle button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      frame.style.width = b.dataset.w + 'px';
      requestAnimationFrame(fit);
    }),
  );
</script>`;

function serve(
  res: ServerResponse,
  status: number,
  contentType: string,
  body: string | Buffer,
): void {
  res.writeHead(status, { 'content-type': contentType });
  res.end(body);
}

async function handleRequest(
  req: import('node:http').IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;

    // Static assets (logo) — served from emails/static/.
    if (path.startsWith('/static/')) {
      const relative = path.slice('/static/'.length);
      const file = join(STATIC_DIR, relative);
      if (!file.startsWith(STATIC_DIR)) {
        serve(res, 403, 'text/plain', 'Forbidden');
        return;
      }
      const body = await readFile(file);
      serve(
        res,
        200,
        path.endsWith('.png') ? 'image/png' : 'application/octet-stream',
        body,
      );
      return;
    }

    const templates = await listTemplates();

    if (path === '/' || path === '/index.html') {
      serve(
        res,
        200,
        'text/html; charset=utf-8',
        page(templates, null, '<p>Select a template…</p>'),
      );
      return;
    }

    const match = /^\/preview\/([a-z0-9-]+)$/.exec(path);
    if (match) {
      const name = match[1] ?? '';
      const props = await loadPreviewProps(`${name}.tsx`);
      if (props === undefined) {
        serve(
          res,
          400,
          'text/html; charset=utf-8',
          page(
            templates,
            name,
            '<p class="error">No PreviewProps on this template.</p>',
          ),
        );
        return;
      }

      let rendered: Awaited<ReturnType<typeof renderEmail>>;
      try {
        rendered = await renderEmail(camelize(name) as never, props as never);
      } catch (error) {
        serve(
          res,
          500,
          'text/html; charset=utf-8',
          page(
            templates,
            name,
            `<p class="error">Render error: ${escapeHtml(String(error))}</p>`,
          ),
        );
        return;
      }

      const content = `
        <div class="bar">
          <strong>${name}</strong>
          <span class="subject-line">${escapeHtml(rendered.subject)}</span>
          <div class="width-toggle">
            <button data-w="760" class="active">Desktop</button>
            <button data-w="375">Mobile</button>
          </div>
        </div>
        <iframe id="frame" class="frame" srcdoc="${escapeHtml(rendered.html)}" title="${name}"></iframe>`;

      serve(
        res,
        200,
        'text/html; charset=utf-8',
        page(templates, name, content, WIDTH_SCRIPT),
      );
      return;
    }

    serve(res, 404, 'text/plain', 'Not found');
  } catch (error) {
    console.error('[preview]', error);
    serve(res, 500, 'text/plain', `Preview error: ${String(error)}`);
  }
}

const server = createServer((req, res) => {
  void handleRequest(req, res);
});

server.listen(PORT, () => {
  console.log(`Shipyard email preview: http://localhost:${PORT}`);
  console.log('  (renders on every request — edit templates, then refresh)');
});
