// Development page: shows figures in fixed poses. Not part of the game build.
import * as THREE from 'three';
import { Figure, KITS, makePose, sampleTrack, type Pose } from '../render/figure';
import * as POSES from '../render/poses';
import { Stadium } from '../render/stadium';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
const scene = new THREE.Scene();
const stadium = new Stadium();
scene.add(stadium.group);
stadium.addLights(scene);
const cam = new THREE.PerspectiveCamera(Number(q.get('fov') ?? 22), innerWidth / innerHeight, 0.1, 900);

const set = q.get('set') ?? 'stance';
const figs: Figure[] = [];
function add(gear: any, kit: any, pose: Pose, x: number, z: number, rot: number, mirror = false, name = 'KOHLI', num = 18) {
  const f = new Figure({ gear, kit, seed: figs.length, number: num, name });
  f.setMirror(mirror);
  f.pose.set(pose);
  f.root.position.set(x, 0, z);
  f.root.rotation.y = rot;
  f.update();
  scene.add(f.root);
  figs.push(f);
  return f;
}
const tmp = makePose({});
const shotPose = (name: any, foot: 'front' | 'back', which: number) => {
  const plan = POSES.buildSwing(name, foot, POSES.BACKLIFT, 0.12, false, null);
  return plan.keys[plan.contactIndex + which].pose;
};
if (set === 'stance') {
  // Seen from the bowler's end: right-hander and left-hander.
  add('batter', KITS.RCB, POSES.STANCE, -1.2, -8.7, -Math.PI / 2, false);
  add('batter', KITS.RCB, POSES.BACKLIFT, 0.2, -8.7, -Math.PI / 2, false);
  add('batter', KITS.CSK, POSES.STANCE, 1.6, -8.7, Math.PI / 2, true, 'DUBE', 25);
  add('batter', KITS.CSK, POSES.BACKLIFT, 3.0, -8.7, Math.PI / 2, true, 'DUBE', 25);
  cam.position.set(Number(q.get('cx') ?? 1), Number(q.get('cy') ?? 1.6), Number(q.get('cz') ?? 0));
  cam.lookAt(1, 0.85, -8.7);
} else if (set === 'shots') {
  const names = ['straight drive', 'cover drive', 'square drive', 'on drive', 'flick', 'glance', 'cut', 'late cut', 'pull', 'defend', 'leave', 'scoop'];
  const which = Number(q.get('k') ?? 0);
  names.forEach((n, i) => {
    add('batter', KITS.RCB, shotPose(n, i >= 6 && i <= 8 ? 'back' : 'front', which), (i % 6) * 1.5 - 3.75, -8.7 - Math.floor(i / 6) * 3, -Math.PI / 2);
  });
  cam.position.set(Number(q.get('cx') ?? 0), 3.2, 3);
  cam.lookAt(0, 0.6, -10);
} else if (set === 'bowl') {
  const keys = POSES.bowlTrack(POSES.runPose(1, makePose({}), false), 1);
  [-0.8, -0.55, -0.32, -0.12, 0, 0.24].forEach((t, i) => {
    sampleTrack(keys, t, tmp);
    add('bowler', KITS.CSK, tmp, i * 1.5 - 3.75, 9, Number(q.get('rot') ?? Math.PI), false, 'HENRY', 21);
  });
  cam.position.set(Number(q.get('cx') ?? 0), 2.2, Number(q.get('cz') ?? 19));
  cam.lookAt(0, 1.1, 9);
} else if (set === 'field') {
  const list: [string, Pose][] = [
    ['fielder', POSES.IDLE], ['fielder', POSES.READY], ['fielder', POSES.PICKUP], ['fielder', POSES.THROW_BACK], ['fielder', POSES.THROW_END],
    ['fielder', POSES.CATCH_HIGH], ['fielder', POSES.CELEBRATE], ['fielder', POSES.DIVE], ['keeper', POSES.KEEPER_CROUCH], ['keeper', POSES.KEEPER_READY],
    ['umpire', POSES.UMP_IDLE], ['batter', POSES.NON_STRIKER],
  ];
  list.forEach(([g, p], i) => add(g, g === 'umpire' ? KITS.UMP : KITS.CSK, p, (i % 6) * 1.5 - 3.75, 2 - Math.floor(i / 6) * 3, 0));
  const sigs = ['out', 'six', 'four', 'wide', 'noball', 'freehit'] as const;
  sigs.forEach((sg, i) => {
    sampleTrack(POSES.signalTrack(sg, POSES.UMP_IDLE), 0.6, tmp);
    add('umpire', KITS.UMP, tmp, i * 1.5 - 3.75, -4, 0);
  });
  cam.position.set(0, 4.5, 14);
  cam.lookAt(0, 0.8, -1);
}
function loop() {
  renderer.render(scene, cam);
  requestAnimationFrame(loop);
}
loop();
(window as any).__ready = true;
