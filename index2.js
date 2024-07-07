const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const { Readable } = require("stream");
const Jimp = require("jimp");

ffmpeg.setFfmpegPath(ffmpegPath);

const framesDir = "frames";
const outputUniqueDir = "unique_frames";

// Create directories if they don't exist
if (!fs.existsSync(framesDir)) {
  fs.mkdirSync(framesDir);
}
if (!fs.existsSync(outputUniqueDir)) {
  fs.mkdirSync(outputUniqueDir);
}

const processVideoBuffer = (buffer, outputUniqueDir) => {
  return new Promise((resolve, reject) => {
    const inputStream = new Readable();
    inputStream._read = () => {};
    inputStream.push(buffer);
    inputStream.push(null);

    ffmpeg(inputStream)
      .output(`${framesDir}/frame-%03d.png`)
      .outputOptions([
        "-vf",
        "select=not(mod(n\\,10)),setpts=N/FRAME_RATE/TB",
        "-vsync",
        "vfr",
      ])
      .on("end", async () => {
        try {
          const uniqueImages = await filterUniqueFrames(
            framesDir,
            outputUniqueDir
          );
          resolve(uniqueImages);
        } catch (error) {
          reject(error);
        }
      })
      .on("error", (err) => {
        reject(err);
      })
      .run();
  });
};

const filterUniqueFrames = async (framesDir, outputUniqueDir) => {
  const frameFiles = fs
    .readdirSync(framesDir)
    .filter((file) => file.endsWith(".png"));
  let prevImage = null;
  let uniqueFrameCount = 0;
  const uniqueImages = [];

  const processFrame = async (framePath) => {
    try {
      const img = await Jimp.read(framePath);
      const buffer = await img.getBufferAsync(Jimp.MIME_PNG);
      if (prevImage) {
        const diff = Jimp.diff(prevImage, img).percent;
        if (diff > 0.3) {
          // Adjust threshold based on your needs
          uniqueImages.push(buffer);
          const uniqueFramePath = path.join(
            outputUniqueDir,
            `unique-frame-${uniqueFrameCount}.png`
          );
          await img.writeAsync(uniqueFramePath);
          uniqueFrameCount++;
          prevImage = img;
        }
      } else {
        uniqueImages.push(buffer);
        const uniqueFramePath = path.join(
          outputUniqueDir,
          `unique-frame-${uniqueFrameCount}.png`
        );
        await img.writeAsync(uniqueFramePath);
        uniqueFrameCount++;
        prevImage = img;
      }
    } catch (error) {
      console.error(`Failed to process ${framePath}:`, error);
    }
  };

  const pMap = await import("p-map");
  await pMap.default(
    frameFiles.map((file) => path.join(framesDir, file)),
    processFrame,
    { concurrency: 4 }
  );

  return uniqueImages;
};

// Example usage
const exampleUsage = async () => {
  const videoBuffer = fs.readFileSync("dog.mp4");
  try {
    console.time("process video buffer");
    const uniqueImages = await processVideoBuffer(videoBuffer, outputUniqueDir);
    console.timeEnd("process video buffer");
    console.log("Unique images processed:", uniqueImages.length);
    // uniqueImages contains buffers of unique frames
  } catch (error) {
    console.error("Error processing video buffer:", error);
  }
};

exampleUsage();
