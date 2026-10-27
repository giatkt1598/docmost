import { deflateRawSync } from 'node:zlib';
import { renderDrawioSvg } from './drawio-svg';
import { graphModelOf, xmlFromDrawioSvg } from './drawio-xml';

const MODEL = `<mxGraphModel><root>
  <mxCell id="0"/><mxCell id="1" parent="0"/>
  <mxCell id="a" value="Start &amp; go" style="rounded=1;fillColor=#dae8fc;" vertex="1" parent="1"><mxGeometry x="20" y="20" width="120" height="60" as="geometry"/></mxCell>
  <mxCell id="b" value="Done?" style="rhombus;" vertex="1" parent="1"><mxGeometry x="220" y="20" width="80" height="80" as="geometry"/></mxCell>
  <mxCell id="c" value="End" style="ellipse;" vertex="1" parent="1"><mxGeometry x="380" y="30" width="80" height="40" as="geometry"/></mxCell>
  <mxCell id="e1" value="next" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>
  <mxCell id="e2" edge="1" parent="1" source="b" target="c" style="dashed=1;"><mxGeometry relative="1" as="geometry"/></mxCell>
</root></mxGraphModel>`;

describe('draw.io diagrams', () => {
  it('renders shapes, labels and edges, and keeps the model inside', () => {
    const { svg } = renderDrawioSvg(MODEL, 'Flow');
    expect(svg).toContain('<rect x="20" y="20" width="120" height="60" rx="10" fill="#dae8fc"');
    expect(svg).toContain('<polygon');
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('>Start &amp; go</text>');
    expect(svg.match(/<line /g)).toHaveLength(2);
    expect(svg).toContain('stroke-dasharray');
    const back = xmlFromDrawioSvg(svg);
    expect(back).toContain('<mxCell id="a"');
    expect(back).toContain('value="Start &amp; go"');
  });

  it('reads compressed draw.io pages', () => {
    const compressed = deflateRawSync(
      Buffer.from(encodeURIComponent(MODEL)),
    ).toString('base64');
    const mxfile = `<mxfile><diagram id="x" name="P">${compressed}</diagram></mxfile>`;
    expect(graphModelOf(mxfile)).toContain('<mxCell id="b"');
  });

  it('refuses what is not draw.io XML', () => {
    expect(() => renderDrawioSvg('<svg/>')).toThrow(/Expected draw.io XML/);
    expect(() => renderDrawioSvg('')).toThrow(/empty/);
    expect(() => xmlFromDrawioSvg('<svg></svg>')).toThrow(/no draw.io diagram/);
  });
});
