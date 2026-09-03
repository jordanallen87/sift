/**
 * The single definition of the narrow/expanded layout boundary.
 *
 * This constant used to exist three times: here (in `use-width-mode.ts`),
 * in `tests/e2e/pages/sift-page.ts`, and inline inside
 * `tests/e2e/helpers/layout-assertions.ts`. Each copy carried a comment
 * saying it "mirrors" the others, which is the whole problem -- a comment
 * is not a mechanism. When the real boundary moved from 480 to 800, both
 * test copies stayed at 480 and six e2e tests began hunting for
 * `workspace-expanded-*` testids inside a layout that had become narrow.
 * The product was right and the tests were wrong, which is the most
 * expensive way for a constant to be duplicated.
 *
 * It lives in its own React-free module so the Playwright suite can import
 * the real value over a relative path (the same way
 * `tests/e2e/helpers/test-server.ts` imports the real `startServer`)
 * without pulling React into the test process.
 *
 * Why 800 rather than CLAUDE.md's canonical 480: 480 describes the width
 * Sift is *designed for*; this constant has to describe the width the
 * *expanded* layout actually needs, and those are different questions.
 * Measured against the running product, walking every element and comparing
 * `scrollWidth` to `clientWidth`:
 *
 * | width | expanded layout |
 * | --- | --- |
 * | 560px | main column 156px wide, Quick Pick's card overflows it by 204px |
 * | 640px | overflows by 124px |
 * | 760px | overflows by 4px |
 * | 770px+ | clean |
 *
 * So every width from 481 to ~765 rendered a two-column layout into a space
 * that cannot hold one: a 300px sidebar plus a card with a ~360px floor does
 * not fit until roughly 770. **ChatGPT's side pane is about 640px**, which is
 * to say the single most important viewport this product has was inside that
 * broken band the entire time, and the 390/430/480/1440 test matrix stepped
 * over it.
 *
 * Nothing caught it because `html, body { overflow-x: hidden }` swallows the
 * symptom at the page level, so `assertNoHorizontalOverflow` -- which measures
 * the document -- kept passing while the pane was visibly torn. The overflow
 * was always *inside* a container. `assertNoElementOverflow` in
 * `tests/e2e/helpers/layout-assertions.ts` now checks the elements themselves,
 * and 640 and 820 are in the viewport matrix.
 *
 * 800, not 770: the measured floor is where it *stops overflowing*, which is
 * not the same as where it starts being good. 800 leaves the main column real
 * room instead of parking the product one text-length change away from the
 * same defect.
 */
export const NARROW_MAX_WIDTH_PX = 800;

/** `true` when `widthPx` falls in pane/WebMCP mode, `false` in expanded web-app mode. */
export function isNarrowWidth(widthPx: number): boolean {
  return widthPx <= NARROW_MAX_WIDTH_PX;
}
