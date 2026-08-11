// House style for components.
//
// Never ship placeholder copy as product content: "Lorem ipsum dolor sit amet, consectetur
// adipiscing elit." is the reviewer's cue that a screen was never written.
//
// Never ship an image with no alternative text: <img src="/card.png" /> is a violation even in a
// component that renders one line.

export function App({ blurb }) {
  return (
    <section>
      <p>{blurb}</p>
    </section>
  );
}
