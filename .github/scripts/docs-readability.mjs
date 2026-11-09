// WCAG 1.4.12 text spacing, plus a 320 CSS-pixel viewport (1.4.10 reflow: 1280px at
// 400% zoom). Use the actual page layout so a future control or font change is tested too.
export async function checkReadability(browser) {
  await browser.evaluate(`(() => {
    const style = document.createElement('style');
    style.textContent = '* { line-height: 1.5 !important; letter-spacing: .12em !important; ' +
      'word-spacing: .16em !important; } p { margin-bottom: 2em !important; }';
    document.head.append(style);
    return new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
  })()`);
  const problems = await browser.evaluate(`(() => {
    const problems = [];
    const viewport = document.documentElement.clientWidth;
    // Mobile Chrome can expand innerWidth to fit overflowing content. clientWidth retains
    // the requested layout viewport, so the check must use it as the boundary.
    if (document.documentElement.scrollWidth > viewport) problems.push('page overflows');
    const visible = el => el.checkVisibility({ visibilityProperty: true });
    const controls = [...document.querySelectorAll('.header-bar a, .header-bar button, ' +
      '.header-bar input, .header-bar summary')].filter(visible);
    for (const el of controls) {
      // Only the closed header row; the collapsed menu's children have no visible rect.
      const r = el.getBoundingClientRect();
      if (r.left < 0 || r.right > viewport) problems.push('header control offscreen: ' + el.outerHTML);
    }
    return problems;
  })()`);
  await browser.evaluate(`document.querySelector('a[href="#api"]').click()`);
  // Wait for native smooth scrolling, without depending on a fixed animation duration.
  await browser.evaluate(`new Promise(done => {
    let previous = scrollY, stable = 0, frames = 0;
    const tick = () => {
      stable = Math.abs(scrollY - previous) < 1 ? stable + 1 : 0;
      previous = scrollY;
      if ((stable > 5 && frames > 10) || frames++ > 120) done();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })`);
  const clear = await browser.evaluate(`(() => {
    const heading = document.querySelector('#api').getBoundingClientRect();
    const header = document.querySelector('.site-header').getBoundingClientRect();
    return heading.top >= Math.max(0, header.bottom) && heading.bottom <= innerHeight;
  })()`);
  if (!clear) problems.push('API anchor is obscured after text spacing');
  return problems;
}
