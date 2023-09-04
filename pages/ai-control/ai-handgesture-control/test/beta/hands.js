const videoElement = document.getElementsByClassName('input_video')[0];

const sess = new onnx.InferenceSession();
const loadingModelPromise = sess.loadModel("./fixed.onnx");

async function updatePredict(flattenedArray){
  const input = new onnx.Tensor(new Float32Array(flattenedArray), "float32", [1,1,126]);
  await loadingModelPromise;

  const outputMap = await sess.run([input]);
  const outputTensor = outputMap.values().next().value;
  const predictions = outputTensor.data;
  const scoreValue = Object.values(predictions);
  const maxPrediction = Math.max(...scoreValue);
  const idx = scoreValue.indexOf(maxPrediction);
  console.log(idx);
}

function onResults(results) {
  let landmarks_left = Array.from({ length: 63 }).fill(0);
  let landmarks_right = Array.from({ length: 63 }).fill(0);
  let flattenedArray;
  if (results.multiHandLandmarks && results.multiHandedness.length) {
    if(results.multiHandedness.length===2){
      landmarks_left = results.multiHandLandmarks[0];
      landmarks_right = results.multiHandLandmarks[1];
      const flatten_1 = landmarks_left.flatMap(obj => Object.values(obj).slice(0, -1));
      const flatten_2 = landmarks_right.flatMap(obj => Object.values(obj).slice(0, -1));
      flattenedArray = flatten_1.concat(flatten_2)
    } else{
      if(results.multiHandedness[0].label==="Left"){
        landmarks_right = results.multiHandLandmarks[0];
        const flatten_2 = landmarks_right.flatMap(obj => Object.values(obj).slice(0, -1));
        flattenedArray = landmarks_left.concat(flatten_2);
      }
      else {
        landmarks_left = results.multiHandLandmarks[0];
        const flatten_1 = landmarks_left.flatMap(obj => Object.values(obj).slice(0, -1));
        flattenedArray = flatten_1.concat(landmarks_right);
      }
    }
    console.log(flattenedArray)
  } else console.log("NO HAND DETECTED");
}

const hands = new Hands({locateFile: (file) => {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
}});
hands.setOptions({
  maxNumHands: 2,
  modelComplexity: 1,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});
hands.onResults(onResults);

const camera = new Camera(videoElement, {
  onFrame: async () => {
    await hands.send({image: videoElement});
  },
  width: 1280,
  height: 720
});
camera.start();
