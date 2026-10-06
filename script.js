import {
    FilesetResolver,
    GestureRecognizer,
    HandLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm";


// ============================================================
// ELEMENTS
// ============================================================

const video =
    document.getElementById("webcam");

const drawCanvas =
    document.getElementById("drawCanvas");

const drawCtx =
    drawCanvas.getContext("2d");

const handCanvas =
    document.getElementById("handCanvas");

const handCtx =
    handCanvas.getContext("2d");

const startBtn =
    document.getElementById("startBtn");

const drawModeBtn =
    document.getElementById("drawModeBtn");

const shapeModeBtn =
    document.getElementById("shapeModeBtn");

const shapeSelect =
    document.getElementById("shapeSelect");

const colorPicker =
    document.getElementById("colorPicker");

const colorValue =
    document.getElementById("colorValue");

const brushSize =
    document.getElementById("brushSize");

const brushValue =
    document.getElementById("brushValue");

const fillShape =
    document.getElementById("fillShape");

const eraserBtn =
    document.getElementById("eraserBtn");

const clearBtn =
    document.getElementById("clearBtn");

const saveBtn =
    document.getElementById("saveBtn");

const statusText =
    document.getElementById("status");

const modeStatus =
    document.getElementById("modeStatus");

const shapeStatus =
    document.getElementById("shapeStatus");

const sizeStatus =
    document.getElementById("sizeStatus");


// ============================================================
// SETTINGS
// ============================================================

const FPS = 30;

const FRAME_TIME =
    1000 / FPS;


// Drawing smoothing
const DRAW_SMOOTHING = 0.38;


// Shape center smoothing
const SHAPE_CENTER_SMOOTHING = 0.35;


// Pointing Up confidence
const POINTING_CONFIDENCE = 0.55;


// Pinch settings
//
// Lower = fingers closer together.
//
// We start the pinch when the ratio is below
// START_PINCH.
//
// We keep the pinch active until RELEASE_PINCH.
//

const START_PINCH = 0.48;

const RELEASE_PINCH = 1.00;


// ============================================================
// STATE
// ============================================================

let gestureRecognizer = null;

let handLandmarker = null;


let cameraRunning = false;

let animationId = null;

let lastDetectionTime = 0;

let lastVideoTime = -1;


// ============================================================
// MODE
// ============================================================

let mode = "draw";


// ============================================================
// DRAWING
// ============================================================

let drawing = false;

let previousPoint = null;

let smoothedDrawPoint = null;


// ============================================================
// DRAWING APPEARANCE
// ============================================================

let currentColor = "#66f2b0";

let currentBrushSize = 6;

let isEraser = false;


// ============================================================
// SHAPES
// ============================================================

let selectedShape = "circle";

let shapeFilled = false;


// ============================================================
// PINCH
// ============================================================

let pinching = false;

let pinchCenter = null;

let smoothedPinchCenter = null;

let pinchSize = 100;

let smoothedPinchRatio = 0;


// ============================================================
// INITIAL UI
// ============================================================

colorValue.textContent =
    currentColor.toUpperCase();

brushValue.textContent =
    `${currentBrushSize}px`;

modeStatus.textContent =
    "Draw";

shapeStatus.textContent =
    "Circle";

sizeStatus.textContent =
    "-";


// ============================================================
// CREATE AI MODELS
// ============================================================

async function createModels() {

    try {

        statusText.textContent =
            "Loading AI hand tracking...";


        // Load MediaPipe WASM
        const vision =
            await FilesetResolver.forVisionTasks(

                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm"

            );


        // ====================================================
        // GESTURE RECOGNIZER
        // Used for Draw Mode
        // ====================================================

        gestureRecognizer =
            await GestureRecognizer.createFromOptions(

                vision,

                {

                    baseOptions: {

                        modelAssetPath:

                            "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task"
                    },


                    runningMode:
                        "VIDEO",


                    numHands:
                        1,


                    minHandDetectionConfidence:
                        0.55,


                    minHandPresenceConfidence:
                        0.55,


                    minTrackingConfidence:
                        0.55,


                    cannedGesturesClassifierOptions: {

                        /*
                            We only care about
                            Pointing_Up for drawing.
                        */

                        categoryAllowlist: [
                            "Pointing_Up"
                        ],


                        scoreThreshold:
                            POINTING_CONFIDENCE,


                        maxResults:
                            1
                    }
                }
            );


        // ====================================================
        // HAND LANDMARKER
        // Used for Shape Mode
        // ====================================================

        handLandmarker =
            await HandLandmarker.createFromOptions(

                vision,

                {

                    baseOptions: {

                        modelAssetPath:

                            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
                    },


                    runningMode:
                        "VIDEO",


                    numHands:
                        1,


                    minHandDetectionConfidence:
                        0.55,


                    minHandPresenceConfidence:
                        0.55,


                    minTrackingConfidence:
                        0.55
                }
            );


        statusText.textContent =
            "AI hand tracking ready";


        return true;


    } catch (error) {

        console.error(
            "Model loading error:",
            error
        );


        statusText.textContent =
            "Failed to load AI tracking";


        return false;
    }
}


// ============================================================
// START CAMERA
// ============================================================

async function startCamera() {

    try {

        // Load models

        if (
            !gestureRecognizer ||
            !handLandmarker
        ) {

            const loaded =
                await createModels();


            if (!loaded) {
                return;
            }
        }


        // Check camera

        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia
        ) {

            statusText.textContent =
                "Camera is not supported";


            return;
        }


        // Ask for webcam

        const stream =
            await navigator.mediaDevices.getUserMedia({

                video: {

                    width: {
                        ideal: 1280
                    },

                    height: {
                        ideal: 720
                    },

                    facingMode:
                        "user"
                },

                audio: false
            });


        video.srcObject =
            stream;


        await video.play();


        cameraRunning =
            true;


        startBtn.textContent =
            "● Camera Running";


        startBtn.disabled =
            true;


        resizeCanvases();


        // Hide camera overlay

        const overlay =
            document.querySelector(
                ".canvas-overlay"
            );


        if (overlay) {

            overlay.style.display =
                "none";
        }


        resetTracking();


        statusText.textContent =
            "Raise only your index finger";


        detectHands();


    } catch (error) {

        console.error(
            "Camera error:",
            error
        );


        if (
            error.name ===
            "NotAllowedError"
        ) {

            statusText.textContent =
                "Camera permission denied";

        } else if (
            error.name ===
            "NotFoundError"
        ) {

            statusText.textContent =
                "No camera found";

        } else {

            statusText.textContent =
                "Unable to access camera";
        }
    }
}


// ============================================================
// CANVAS SIZE
// ============================================================

function resizeCanvases() {

    if (
        !video.videoWidth ||
        !video.videoHeight
    ) {

        return;
    }


    drawCanvas.width =
        video.videoWidth;


    drawCanvas.height =
        video.videoHeight;


    handCanvas.width =
        video.videoWidth;


    handCanvas.height =
        video.videoHeight;
}


// ============================================================
// RESET TRACKING
// ============================================================

function resetTracking() {

    drawing =
        false;


    previousPoint =
        null;


    smoothedDrawPoint =
        null;


    pinching =
        false;


    pinchCenter =
        null;


    smoothedPinchCenter =
        null;


    pinchSize =
        100;


    smoothedPinchRatio =
        0;


    handCtx.clearRect(

        0,

        0,

        handCanvas.width,

        handCanvas.height
    );
}


// ============================================================
// DETECTION LOOP
// ============================================================

function detectHands() {

    if (!cameraRunning) {

        return;
    }


    const now =
        performance.now();


    const enoughTime =
        now -
        lastDetectionTime >=
        FRAME_TIME;


    const newFrame =
        video.currentTime !==
        lastVideoTime;


    if (
        enoughTime &&
        newFrame &&
        video.readyState >= 2
    ) {

        lastDetectionTime =
            now;


        lastVideoTime =
            video.currentTime;


        try {

            /*
                Use a separate model depending
                on the selected mode.
            */

            if (
                mode === "draw"
            ) {

                const result =
                    gestureRecognizer.recognizeForVideo(

                        video,

                        now
                    );


                processDrawResult(
                    result
                );


            } else {

                const result =
                    handLandmarker.detectForVideo(

                        video,

                        now
                    );


                processShapeResult(
                    result
                );
            }


        } catch (error) {

            console.error(
                "Tracking error:",
                error
            );
        }
    }


    animationId =
        requestAnimationFrame(
            detectHands
        );
}


// ============================================================
// DRAW MODE
// ============================================================

function processDrawResult(
    result
) {

    handCtx.clearRect(

        0,

        0,

        handCanvas.width,

        handCanvas.height
    );


    if (
        !result.landmarks ||
        result.landmarks.length === 0
    ) {

        stopDrawing();


        statusText.textContent =
            "No hand detected";


        return;
    }


    const landmarks =
        result.landmarks[0];


    let pointingUp =
        false;


    let confidence =
        0;


    /*
        Gesture Recognizer returns the
        recognized gesture and score.
    */

    if (
        result.gestures &&
        result.gestures.length > 0 &&
        result.gestures[0].length > 0
    ) {

        const gesture =
            result.gestures[0][0];


        if (
            gesture.categoryName ===
            "Pointing_Up"
        ) {

            confidence =
                gesture.score;


            if (
                confidence >=
                POINTING_CONFIDENCE
            ) {

                pointingUp =
                    true;
            }
        }
    }


    // ========================================================
    // INDEX FINGER DRAW
    // ========================================================

    if (pointingUp) {

        const fingertip =
            landmarks[8];


        const rawPoint =
            convertToCanvasCoordinates(
                fingertip
            );


        smoothedDrawPoint =
            smoothPoint(

                smoothedDrawPoint,

                rawPoint,

                DRAW_SMOOTHING
            );


        drawing =
            true;


        drawHandPointer(
            fingertip,
            currentColor
        );


        draw(
            smoothedDrawPoint
        );


        statusText.textContent =
            `Index finger • Drawing ${Math.round(
                confidence * 100
            )}%`;


    } else {

        stopDrawing();


        /*
            Show index fingertip so the user
            knows where to point.
        */

        drawHandPointer(
            landmarks[8],
            "#ffffff"
        );


        statusText.textContent =
            "Raise ONLY your index finger";
    }
}


// ============================================================
// STOP DRAWING
// ============================================================

function stopDrawing() {

    drawing =
        false;


    previousPoint =
        null;


    smoothedDrawPoint =
        null;
}


// ============================================================
// SHAPE MODE
// ============================================================

function processShapeResult(
    result
) {

    handCtx.clearRect(

        0,

        0,

        handCanvas.width,

        handCanvas.height
    );


    if (
        !result.landmarks ||
        result.landmarks.length === 0
    ) {

        /*
            If the hand disappears while
            pinching, place the shape.
        */

        if (pinching) {

            placeShape();
        }


        pinching =
            false;


        pinchCenter =
            null;


        smoothedPinchCenter =
            null;


        smoothedPinchRatio =
            0;


        statusText.textContent =
            "No hand detected";


        return;
    }


    const landmarks =
        result.landmarks[0];


    const thumb =
        landmarks[4];


    const index =
        landmarks[8];


    // ========================================================
    // PALM SIZE
    // ========================================================

    /*
        Distance between index MCP and pinky MCP.

        This is a good estimate of palm width.
    */

    const palmWidth =
        distance2D(

            landmarks[5],

            landmarks[17]
        );


    if (
        palmWidth < 0.01
    ) {

        return;
    }


    // ========================================================
    // PINCH DISTANCE
    // ========================================================

    const thumbIndexDistance =
        distance2D(

            thumb,

            index
        );


    /*
        Normalize pinch based on hand size.

        This allows pinch to work whether
        hand is close or far from webcam.
    */

    const pinchRatio =
        thumbIndexDistance /
        palmWidth;


    // ========================================================
    // SMOOTH PINCH RATIO
    // ========================================================

    if (
        smoothedPinchRatio === 0
    ) {

        smoothedPinchRatio =
            pinchRatio;

    } else {

        smoothedPinchRatio +=
            (
                pinchRatio -
                smoothedPinchRatio
            )
            *
            0.30;
    }


    // ========================================================
    // PINCH CENTER
    // ========================================================

    const midpoint = {

        x:
            (
                thumb.x +
                index.x
            ) / 2,

        y:
            (
                thumb.y +
                index.y
            ) / 2
    };


    const rawCenter =
        convertToCanvasCoordinates(
            midpoint
        );


    smoothedPinchCenter =
        smoothPoint(

            smoothedPinchCenter,

            rawCenter,

            SHAPE_CENTER_SMOOTHING
        );


    // ========================================================
    // VISUAL HAND POINTER
    // ========================================================

    drawHandPointer(
        thumb,
        "#ffffff"
    );


    drawHandPointer(
        index,
        currentColor
    );


    drawPinchLine(
        thumb,
        index
    );


    // ========================================================
    // START PINCH
    // ========================================================

    if (
        !pinching &&
        smoothedPinchRatio <
        START_PINCH
    ) {

        pinching =
            true;


        pinchCenter =
            smoothedPinchCenter;


        pinchSize =
            pinchRatioToSize(
                smoothedPinchRatio
            );


        sizeStatus.textContent =
            `Size: ${Math.round(
                pinchSize
            )} px`;


        statusText.textContent =
            "Pinching • Move fingers apart";


        drawShapePreview(

            pinchCenter,

            pinchSize
        );


        return;
    }


    // ========================================================
    // PINCH ACTIVE
    // ========================================================

    if (
        pinching &&
        smoothedPinchRatio <
        RELEASE_PINCH
    ) {

        /*
            Update the shape center.
        */

        pinchCenter =
            smoothedPinchCenter;


        /*
            Convert distance to size.
        */

        const targetSize =
            pinchRatioToSize(
                smoothedPinchRatio
            );


        /*
            Smooth the size.
        */

        pinchSize +=
            (
                targetSize -
                pinchSize
            )
            *
            0.22;


        sizeStatus.textContent =
            `Size: ${Math.round(
                pinchSize
            )} px`;


        statusText.textContent =
            "Move thumb ↔ index to resize";


        /*
            Show live preview.
        */

        drawShapePreview(

            pinchCenter,

            pinchSize
        );


        return;
    }


    // ========================================================
    // RELEASE
    // ========================================================

    if (
        pinching &&
        smoothedPinchRatio >=
        RELEASE_PINCH
    ) {

        placeShape();


        pinching =
            false;


        pinchCenter =
            null;


        smoothedPinchCenter =
            null;


        smoothedPinchRatio =
            0;


        statusText.textContent =
            "Shape placed ✓";


        return;
    }


    // ========================================================
    // WAITING
    // ========================================================

    statusText.textContent =
        "Pinch thumb + index to create a shape";
}


// ============================================================
// PINCH RATIO → SIZE
// ============================================================

function pinchRatioToSize(
    ratio
) {

    const canvasSize =
        Math.min(

            drawCanvas.width,

            drawCanvas.height
        );


    /*
        This is the usable pinch range.

        Very close:
        small shape

        Fingers farther apart:
        larger shape
    */

    const MIN_RATIO =
        0.25;


    const MAX_RATIO =
        0.95;


    const MIN_SIZE =
        canvasSize *
        0.06;


    const MAX_SIZE =
        canvasSize *
        0.60;


    // Clamp ratio

    const clamped =
        Math.max(

            MIN_RATIO,

            Math.min(
                ratio,
                MAX_RATIO
            )
        );


    // Convert to 0 → 1

    const percentage =
        (
            clamped -
            MIN_RATIO
        )
        /
        (
            MAX_RATIO -
            MIN_RATIO
        );


    /*
        Slight curve for more natural control.
    */

    const curved =
        Math.pow(
            percentage,
            0.8
        );


    return (

        MIN_SIZE +

        (
            MAX_SIZE -
            MIN_SIZE
        )
        *
        curved
    );
}


// ============================================================
// PLACE SHAPE
// ============================================================

function placeShape() {

    if (
        !pinchCenter
    ) {

        return;
    }


    drawShape(

        drawCtx,

        pinchCenter,

        pinchSize,

        selectedShape,

        currentColor,

        shapeFilled
    );


    handCtx.clearRect(

        0,

        0,

        handCanvas.width,

        handCanvas.height
    );


    sizeStatus.textContent =
        `Size: ${Math.round(
            pinchSize
        )} px`;
}


// ============================================================
// DRAW SHAPE
// ============================================================

function drawShape(

    ctx,

    center,

    size,

    shape,

    color,

    filled

) {

    ctx.save();


    ctx.globalCompositeOperation =
        "source-over";


    ctx.strokeStyle =
        color;


    ctx.fillStyle =
        color;


    ctx.lineWidth =
        5;


    ctx.lineCap =
        "round";


    ctx.lineJoin =
        "round";


    ctx.beginPath();


    // ========================================================
    // CIRCLE
    // ========================================================

    if (
        shape === "circle"
    ) {

        ctx.arc(

            center.x,

            center.y,

            size / 2,

            0,

            Math.PI * 2
        );
    }


    // ========================================================
    // RECTANGLE
    // ========================================================

    else if (
        shape === "rectangle"
    ) {

        ctx.rect(

            center.x -
            size / 2,

            center.y -
            size / 2,

            size,

            size
        );
    }


    // ========================================================
    // LINE
    // ========================================================

    else if (
        shape === "line"
    ) {

        ctx.moveTo(

            center.x -
            size / 2,

            center.y
        );


        ctx.lineTo(

            center.x +
            size / 2,

            center.y
        );
    }


    // ========================================================
    // TRIANGLE
    // ========================================================

    else if (
        shape === "triangle"
    ) {

        const height =
            size *
            0.866;


        ctx.moveTo(

            center.x,

            center.y -
            height / 2
        );


        ctx.lineTo(

            center.x -
            size / 2,

            center.y +
            height / 2
        );


        ctx.lineTo(

            center.x +
            size / 2,

            center.y +
            height / 2
        );


        ctx.closePath();
    }


    // Fill

    if (
        filled
    ) {

        ctx.fill();
    }


    // Outline

    ctx.stroke();


    ctx.restore();
}


// ============================================================
// SHAPE PREVIEW
// ============================================================

function drawShapePreview(

    center,

    size

) {

    drawShape(

        handCtx,

        center,

        size,

        selectedShape,

        currentColor,

        shapeFilled
    );


    /*
        Dashed guide around the shape.
    */

    handCtx.beginPath();


    handCtx.arc(

        center.x,

        center.y,

        size / 2 + 9,

        0,

        Math.PI * 2
    );


    handCtx.strokeStyle =
        "rgba(255,255,255,0.65)";


    handCtx.lineWidth =
        2;


    handCtx.setLineDash([

        6,

        6
    ]);


    handCtx.stroke();


    handCtx.setLineDash([]);
}


// ============================================================
// FREEHAND DRAW
// ============================================================

function draw(
    point
) {

    if (!drawing) {

        return;
    }


    if (!previousPoint) {

        previousPoint =
            point;


        return;
    }


    const distance =
        distance2DCanvas(

            previousPoint,

            point
        );


    /*
        Ignore tiny movements.
    */

    if (
        distance < 1.2
    ) {

        return;
    }


    drawCtx.beginPath();


    drawCtx.moveTo(

        previousPoint.x,

        previousPoint.y
    );


    drawCtx.lineTo(

        point.x,

        point.y
    );


    drawCtx.lineWidth =
        currentBrushSize;


    drawCtx.lineCap =
        "round";


    drawCtx.lineJoin =
        "round";


    if (
        isEraser
    ) {

        drawCtx.globalCompositeOperation =
            "destination-out";

    } else {

        drawCtx.globalCompositeOperation =
            "source-over";


        drawCtx.strokeStyle =
            currentColor;
    }


    drawCtx.stroke();


    drawCtx.globalCompositeOperation =
        "source-over";


    previousPoint =
        point;
}


// ============================================================
// SMOOTH POINT
// ============================================================

function smoothPoint(

    previous,

    current,

    smoothing

) {

    if (!previous) {

        return {

            x: current.x,

            y: current.y
        };
    }


    return {

        x:
            previous.x +
            (
                current.x -
                previous.x
            )
            *
            smoothing,


        y:
            previous.y +
            (
                current.y -
                previous.y
            )
            *
            smoothing
    };
}


// ============================================================
// LANDMARK POINTER
// ============================================================

function drawHandPointer(

    landmark,

    color

) {

    const point =
        convertToCanvasCoordinates(
            landmark
        );


    // Outer circle

    handCtx.beginPath();


    handCtx.arc(

        point.x,

        point.y,

        14,

        0,

        Math.PI * 2
    );


    handCtx.strokeStyle =
        "rgba(255,255,255,0.9)";


    handCtx.lineWidth =
        2;


    handCtx.stroke();


    // Inner dot

    handCtx.beginPath();


    handCtx.arc(

        point.x,

        point.y,

        7,

        0,

        Math.PI * 2
    );


    handCtx.fillStyle =
        color;


    handCtx.fill();
}


// ============================================================
// PINCH LINE
// ============================================================

function drawPinchLine(

    thumb,

    index

) {

    const thumbPoint =
        convertToCanvasCoordinates(
            thumb
        );


    const indexPoint =
        convertToCanvasCoordinates(
            index
        );


    handCtx.beginPath();


    handCtx.moveTo(

        thumbPoint.x,

        thumbPoint.y
    );


    handCtx.lineTo(

        indexPoint.x,

        indexPoint.y
    );


    handCtx.strokeStyle =
        currentColor;


    handCtx.lineWidth =
        3;


    handCtx.stroke();
}


// ============================================================
// COORDINATES
// ============================================================

function convertToCanvasCoordinates(

    landmark

) {

    return {

        /*
            Camera is mirrored in CSS.
        */

        x:
            (1 - landmark.x)
            *
            drawCanvas.width,


        y:
            landmark.y
            *
            drawCanvas.height
    };
}


// ============================================================
// LANDMARK DISTANCE
// ============================================================

function distance2D(

    a,

    b

) {

    const dx =
        a.x -
        b.x;


    const dy =
        a.y -
        b.y;


    return Math.sqrt(

        dx * dx +

        dy * dy
    );
}


// ============================================================
// CANVAS DISTANCE
// ============================================================

function distance2DCanvas(

    a,

    b

) {

    const dx =
        a.x -
        b.x;


    const dy =
        a.y -
        b.y;


    return Math.sqrt(

        dx * dx +

        dy * dy
    );
}


// ============================================================
// DRAW MODE BUTTON
// ============================================================

drawModeBtn.addEventListener(

    "click",

    () => {

        mode =
            "draw";


        drawModeBtn.classList.add(
            "active"
        );


        shapeModeBtn.classList.remove(
            "active"
        );


        resetTracking();


        modeStatus.textContent =
            "Draw";


        sizeStatus.textContent =
            "-";


        statusText.textContent =
            "Raise ONLY your index finger";
    }

);


// ============================================================
// SHAPE MODE BUTTON
// ============================================================

shapeModeBtn.addEventListener(

    "click",

    () => {

        mode =
            "shape";


        shapeModeBtn.classList.add(
            "active"
        );


        drawModeBtn.classList.remove(
            "active"
        );


        resetTracking();


        modeStatus.textContent =
            "Shapes";


        statusText.textContent =
            "Pinch thumb + index";
    }

);


// ============================================================
// SHAPE SELECT
// ============================================================

shapeSelect.addEventListener(

    "change",

    (event) => {

        selectedShape =
            event.target.value;


        shapeStatus.textContent =
            capitalize(
                selectedShape
            );
    }

);


// ============================================================
// COLOR PICKER
// ============================================================

colorPicker.addEventListener(

    "input",

    (event) => {

        currentColor =
            event.target.value;


        colorValue.textContent =
            currentColor.toUpperCase();


        isEraser =
            false;


        eraserBtn.textContent =
            "Eraser";
    }

);


// ============================================================
// BRUSH SIZE
// ============================================================

brushSize.addEventListener(

    "input",

    (event) => {

        currentBrushSize =
            Number(
                event.target.value
            );


        brushValue.textContent =
            `${currentBrushSize}px`;
    }

);


// ============================================================
// FILL SHAPE
// ============================================================

fillShape.addEventListener(

    "change",

    (event) => {

        shapeFilled =
            event.target.checked;
    }

);


// ============================================================
// ERASER
// ============================================================

eraserBtn.addEventListener(

    "click",

    () => {

        isEraser =
            !isEraser;


        if (
            isEraser
        ) {

            eraserBtn.textContent =
                "Eraser ON";

        } else {

            eraserBtn.textContent =
                "Eraser";
        }
    }

);


// ============================================================
// CLEAR
// ============================================================

clearBtn.addEventListener(

    "click",

    () => {

        drawCtx.clearRect(

            0,

            0,

            drawCanvas.width,

            drawCanvas.height
        );


        handCtx.clearRect(

            0,

            0,

            handCanvas.width,

            handCanvas.height
        );


        resetTracking();


        sizeStatus.textContent =
            "-";


        statusText.textContent =
            "Canvas cleared";
    }

);


// ============================================================
// SAVE
// ============================================================

saveBtn.addEventListener(

    "click",

    () => {

        const link =
            document.createElement(
                "a"
            );


        link.download =
            "air-canvas-drawing.png";


        link.href =
            drawCanvas.toDataURL(
                "image/png"
            );


        link.click();
    }

);


// ============================================================
// START CAMERA
// ============================================================

startBtn.addEventListener(

    "click",

    startCamera
);


// ============================================================
// CAPITALIZE
// ============================================================

function capitalize(
    text
) {

    return (

        text.charAt(0).toUpperCase() +

        text.slice(1)
    );
}


// ============================================================
// CLEANUP
// ============================================================

window.addEventListener(

    "beforeunload",

    () => {

        cameraRunning =
            false;


        if (
            video.srcObject
        ) {

            video.srcObject
                .getTracks()
                .forEach(
                    track => track.stop()
                );
        }


        if (
            gestureRecognizer
        ) {

            try {

                gestureRecognizer.close();

            } catch (error) {

                console.warn(
                    "Gesture cleanup:",
                    error
                );
            }
        }


        if (
            handLandmarker
        ) {

            try {

                handLandmarker.close();

            } catch (error) {

                console.warn(
                    "Hand cleanup:",
                    error
                );
            }
        }


        if (
            animationId
        ) {

            cancelAnimationFrame(
                animationId
            );
        }
    }

);