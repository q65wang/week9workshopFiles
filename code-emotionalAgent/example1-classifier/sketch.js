// EXAMPLE 1: the inference call stays visible; model setup is in classifier-model.js.
const LABELS = ["happy", "sad", "calm", "anxious", "angry"];
const MODEL_URL = new URL("../model/model.json", document.baseURI).href;
let classifier; // Loaded once, then reused for each camera frame.
let scores = {}; // Latest raw output, keyed by label rather than result position.

function setup() {
  createCanvas(960, 620).parent("canvas-host");
  pixelDensity(1);
  textFont("sans-serif");
  // Prepare shared helpers and connect UI events to this sketch's actions.
  CameraInput.initialize();
  DemoUI.initialize(LABELS, {
    onStart: startExperience,
    onStop: stopExperience,
    onScores: receiveScores,
  });
}

async function startExperience() {
  // A fresh run clears old camera/scores and receives a token to cancel any
  // asynchronous work if Stop is clicked during model or camera setup.
  CameraInput.release();
  const token = ExperienceState.beginLoading();
  scores = {};
  let cameraReady = false;
  try {
    if (!(await CameraInput.requestAccess(() =>
      ExperienceState.isCurrentSession(token) && ExperienceState.mode === "loading"))) return;
    cameraReady = true;
    if (!ExperienceState.isCurrentSession(token)) return;
    classifier = await ClassifierModel.loadClassifier(MODEL_URL, LABELS);
    if (!ExperienceState.isCurrentSession(token)) return;
    if (!ExperienceState.markInferenceLive(token)) return;
    DemoUI.setStatusMessage("WEBCAM INFERENCE: live model scores.");
    classifyNextFrame(token);
  } catch (error) {
    if (ExperienceState.isCurrentSession(token)) handleExperienceError(error, cameraReady);
  }
}

async function classifyNextFrame(token) {
  // The token and mode prevent an old inference loop from continuing after Stop.
  if (!isLiveSession(token)) return;
  try {
    if (CameraInput.captureSquareFrame()) {
      // Classify only the square camera frame, never labels or the agent.
      const results = await classifier.classify(CameraInput.frame.canvas);
      if (!isLiveSession(token)) return;
      receiveScores(ClassifierModel.mapResultsToScores(results, LABELS), false);
    }
    // One prediction at a time. A short pause keeps laptop load manageable.
    setTimeout(() => classifyNextFrame(token), 120);
  } catch (error) {
    if (isLiveSession(token)) handleExperienceError(error);
  }
}

function receiveScores(newScores, designTest) {
  // Keep the model's original scores available for the bar chart and ranking.
  ExperienceState.recordScores(newScores);
  scores = newScores; // keyed by label, NOT by the changing result rank
  if (!designTest) DemoUI.setStatusMessage(
    "WEBCAM INFERENCE: live model scores. Scores are not measurements of anyone's feelings.",
  );
}

function isLiveSession(token) {
  return ExperienceState.isCurrentSession(token) && ExperienceState.mode === "live";
}

function stopExperience() {
  // Stopping invalidates async callbacks before releasing the physical camera.
  ExperienceState.stop();
  CameraInput.release();
  DemoUI.setStatusMessage("Stopped. Camera released.");
}

function handleExperienceError(error, keepCamera = false) {
  // Keep an already-open camera for preview if model setup fails.
  ExperienceState.stop();
  if (!keepCamera) CameraInput.release();
  DemoUI.resetAfterError(error, keepCamera);
}

function draw() {
  // Rendering is separate from inference: p5 redraws this view many times
  // between slower model predictions.
  if (CameraInput.stream) CameraInput.captureSquareFrame();
  background(255);
  fill(35);
  noStroke();
  textSize(20);
  text("Square webcam input", 32, 40);
  DemoUI.drawCameraPreview(CameraInput, ExperienceState, 32, 60, 400);
  text("All model scores", 490, 40);
  DemoUI.drawClassScoreBars(ExperienceState, 490, 82, 420, LABELS);
  textSize(20);
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  text(
    ExperienceState.hasRecentScores() && top
      ? `Leading label: ${top[0]} (${(top[1] * 100).toFixed(1)}%)`
      : "Waiting for a recent prediction",
    32,
    520,
  );
  textSize(17);
  fill(75);
  text("A class score is not a measurement of anyone's feelings.", 32, 562);
}
