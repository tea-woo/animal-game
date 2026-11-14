// three.js 로더 — importmap('three')을 우선 사용하고, 실패하면 다른 CDN으로 자동 폴백한다.
// (빌드 과정 없이 GitHub Pages에서 바로 동작하도록)
const SOURCES = [
  'three',
  'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js',
  'https://unpkg.com/three@0.169.0/build/three.module.js',
  'https://esm.sh/three@0.169.0',
];

let mod = null;
const failures = [];

for (const src of SOURCES) {
  try {
    const m = await import(/* webpackIgnore: true */ src);
    if (m && m.Scene && m.WebGLRenderer) {
      mod = m;
      break;
    }
    failures.push(`${src}: 모듈 형태가 올바르지 않습니다`);
  } catch (err) {
    failures.push(`${src}: ${err && err.message ? err.message : err}`);
  }
}

if (!mod) {
  throw new Error('three.js를 불러오지 못했습니다. 네트워크를 확인해 주세요.\n' + failures.join('\n'));
}

export const THREE = mod;
export default mod;
