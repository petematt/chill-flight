import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createBalloonModel } from '../balloon-model.js';
import { createSeaplaneModel } from '../airplane.js';
import { createBiplaneModel } from '../biplane.js';
import { createJetModel } from '../jet.js';
import { createTwinModel } from '../twin.js';
import { createBuggyModel } from '../buggy-model.js';
import { EMBLEMS } from '../balloon-decals.js';

window.THREE = THREE;
window.OrbitControls = OrbitControls;
window.createBalloonModel = createBalloonModel;
window.createSeaplaneModel = createSeaplaneModel;
window.createBiplaneModel = createBiplaneModel;
window.createJetModel = createJetModel;
window.createTwinModel = createTwinModel;
window.createBuggyModel = createBuggyModel;
window.EMBLEMS = EMBLEMS;
