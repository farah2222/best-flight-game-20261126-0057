// Keyboard and mouse state. Axes are read fresh each tick;
// actions (pause, camera, flaps...) fire once per key press.

export function makeInput(canvas) {
  const input = {
    keys: new Set(),
    pressed: new Set(), // edge-triggered, consumed by the game each frame
    mouseDown: false,
    mouseX: 0, mouseY: 0,
    mouseSteer: 0, mousePitch: 0,
    lookX: 0, lookY: 0, looking: false,
  };

  const KEYMAP = {
    KeyW: 'pitchUp', ArrowUp: 'pitchUp',
    KeyS: 'pitchDown', ArrowDown: 'pitchDown',
    KeyA: 'rollLeft', ArrowLeft: 'rollLeft',
    KeyD: 'rollRight', ArrowRight: 'rollRight',
    KeyQ: 'rudderLeft', KeyE: 'rudderRight',
    ShiftLeft: 'throttleUp', ShiftRight: 'throttleUp',
    ControlLeft: 'throttleDown', ControlRight: 'throttleDown',
    KeyB: 'brake', KeyC: 'camera', KeyF: 'flaps',
    KeyP: 'pause', Escape: 'pause', KeyR: 'restart',
    KeyM: 'mute', Enter: 'confirm', Space: 'confirm',
    Digit1: 'mission1', Digit2: 'mission2',
    Digit3: 'mission3', Digit4: 'mission4',
  };

  window.addEventListener('keydown', (e) => {
    const action = KEYMAP[e.code];
    if (!action) return;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!e.repeat) {
      input.keys.add(action);
      input.pressed.add(action);
    }
  });
  window.addEventListener('keyup', (e) => {
    const action = KEYMAP[e.code];
    if (action) input.keys.delete(action);
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
  });

  canvas.addEventListener('mousedown', (e) => {
    input.mouseDown = true;
    input.mouseX = e.clientX;
    input.mouseY = e.clientY;
    if (e.button === 2) input.looking = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 2) input.looking = false;
    if (e.button === 0) {
      input.mouseDown = false;
      input.mouseSteer = 0;
      input.mousePitch = 0;
    }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    if (input.looking) {
      input.lookX = nx * 0.9;
      input.lookY = -ny * 0.5;
    } else if (input.mouseDown && e.buttons === 1) {
      input.mouseSteer = nx * 0.8;
      input.mousePitch = -ny * 0.6;
    }
  });
  window.addEventListener('mousemove', (e) => {
    if (!input.looking) { input.lookX = 0; input.lookY = 0; }
  });

  return input;
}

// Continuous axes for this tick, -1..1.
export function readAxes(input) {
  const pitch = (input.keys.has('pitchUp') ? 1 : 0) - (input.keys.has('pitchDown') ? 1 : 0);
  const roll = (input.keys.has('rollRight') ? 1 : 0) - (input.keys.has('rollLeft') ? 1 : 0);
  const rudder = (input.keys.has('rudderRight') ? 1 : 0) - (input.keys.has('rudderLeft') ? 1 : 0);
  let throttleDelta = 0;
  if (input.keys.has('throttleUp')) throttleDelta += 1;
  if (input.keys.has('throttleDown')) throttleDelta -= 1;
  const brake = input.keys.has('brake');
  // Mouse steering blends in gently when the left button is held.
  const mouseRoll = input.mouseDown && !input.looking ? input.mouseSteer : 0;
  const mousePitch = input.mouseDown && !input.looking ? input.mousePitch : 0;
  return {
    pitch: clampAxis(pitch + mousePitch * 0.7),
    roll: clampAxis(roll + mouseRoll * 0.7),
    rudder,
    throttleDelta,
    brake,
  };
}

function clampAxis(v) {
  return v > 1 ? 1 : v < -1 ? -1 : v;
}

// True once for a key pressed since the last frame; consumed here.
export function takePressed(input, action) {
  if (input.pressed.has(action)) {
    input.pressed.delete(action);
    return true;
  }
  return false;
}

export function clearPressed(input) {
  input.pressed.clear();
}
