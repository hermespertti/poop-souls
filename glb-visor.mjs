// Where is the visor in glTF space? (DataView-based)
import fs from 'fs';
const buf = fs.readFileSync('public/model.glb');
let off = 12;
let json = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off);
  const type = buf.toString('ascii', off + 4, off + 8);
  if (type === 'JSON') json = JSON.parse(buf.toString('utf8', off + 8, off + 8 + len));
  else { bin = new DataView(buf.buffer, buf.byteOffset + off + 8, len); }
  off += 8 + len;
}
for (const mesh of json.meshes) {
  for (const prim of mesh.primitives) {
    const posAcc = json.accessors[prim.attributes.POSITION];
    const bv = json.bufferViews[posAcc.bufferView];
    const bo = (bv.byteOffset || 0) + (posAcc.byteOffset || 0);
    const f = (i) => bin.getFloat32(bo + i * 4, true);
    // use the accessor's declared min/max if present, else scan
    let min = posAcc.min, max = posAcc.max;
    if (!min) {
      min = [Infinity, Infinity, Infinity]; max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < posAcc.count; i++) for (let k = 0; k < 3; k++) {
        const v = f(i * 3 + k);
        if (v < min[k]) min[k] = v;
        if (v > max[k]) max[k] = v;
      }
    }
    const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2, cz = (min[2] + max[2]) / 2;
    console.log(`mat=${json.materials[prim.material].name.padEnd(6)} center=(${cx.toFixed(3)}, ${cy.toFixed(3)}, ${cz.toFixed(3)}) size=(${(max[0]-min[0]).toFixed(2)}, ${(max[1]-min[1]).toFixed(2)}, ${(max[2]-min[2]).toFixed(2)})`);
  }
}
