// Parse the GLB JSON chunk: node/mesh names + transforms
import fs from 'fs';
const buf = fs.readFileSync('public/model.glb');
// GLB header: magic(4) version(4) length(4), then chunks: length(4) type(4) data
let off = 12;
while (off < buf.length) {
  const len = buf.readUInt32LE(off);
  const type = buf.toString('ascii', off + 4, off + 8);
  if (type === 'JSON') {
    const json = JSON.parse(buf.toString('utf8', off + 8, off + 8 + len));
    console.log('=== MESHES ===');
    for (const m of json.meshes || []) console.log(' mesh:', m.name, (m.primitives||[]).length, 'prims');
    console.log('=== NODES ===');
    for (const n of json.nodes || []) {
      const t = n.translation ? ` T=[${n.translation.map(v=>v.toFixed(2))}]` : '';
      const r = n.rotation ? ` R=[${n.rotation.map(v=>v.toFixed(3))}]` : '';
      const s = n.scale ? ` S=[${n.scale.map(v=>v.toFixed(2))}]` : '';
      console.log(` node: ${n.name}${t}${r}${s} children=${n.children?.join(',')||''}`);
    }
    console.log('=== ANIMS ===', (json.animations||[]).map(a=>a.name).join(', '));
    console.log('=== SCENES ===', JSON.stringify(json.scenes));
    console.log('=== ASSET ===', JSON.stringify(json.asset));
  }
  off += 8 + len;
}
