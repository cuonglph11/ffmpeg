const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const { Readable } = require("stream");
const Jimp = require("jimp");

ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Configs
 */
const outputUniqueDir = "unique_frames";
const diffThreshold = 0.3;
const newWidth = 640; // Desired width
const newHeight = 360; // Desired height

const processVideoBuffer = (buffer, outputUniqueDir, isSaved) => {
  // Create directories if they don't exist
  const originalFramesDir = "original_frames";
  if (!fs.existsSync(originalFramesDir)) {
    fs.mkdirSync(originalFramesDir);
  }
  if (!fs.existsSync(outputUniqueDir)) {
    fs.mkdirSync(outputUniqueDir);
  }

  return new Promise((resolve, reject) => {
    const inputStream = new Readable();
    inputStream._read = () => {};
    inputStream.push(buffer);
    inputStream.push(null);

    ffmpeg(inputStream)
      .output(`${originalFramesDir}/frame-%03d.png`)
      .outputOptions([
        `-vf scale=${newWidth}:${newHeight},select='not(mod(n\\,10))',setpts='N/(FRAME_RATE*TB)'`,
        "-vsync vfr",
      ])
      .on("end", async () => {
        try {
          const uniqueBufferImages = await filterUniqueFrames(
            originalFramesDir
          );

          //   Delete original frames
          fs.rm(originalFramesDir, { recursive: true }, (err) => {
            if (err) throw err;
          });

          if (isSaved) {
            // Save unique images to disk
            uniqueBufferImages.forEach((imgBuffer, index) => {
              const outputPath = path.join(
                outputUniqueDir,
                `unique-frame-${index}.png`
              );
              fs.promises.writeFile(outputPath, imgBuffer);
            });
          }

          resolve(uniqueBufferImages);
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

const filterUniqueFrames = async (originalFramesDir) => {
  const frameFiles = fs
    .readdirSync(originalFramesDir)
    .filter((file) => file.endsWith(".png"));

  let prevPngFrame = null;
  let uniqueFrameCount = 0;
  const uniqueBufferImages = [];

  const framesLength = frameFiles.length;

  for (let i = 0; i < framesLength; i++) {
    const framePath = path.join(originalFramesDir, frameFiles[i]);
    try {
      const pngFrame = await Jimp.read(framePath);
      const bufferFrame = await pngFrame.getBufferAsync(Jimp.MIME_PNG);

      const isUniqueWithPrevious = (prevImage) => {
        if (!prevImage) return true;
        const diff = Jimp.diff(prevImage, pngFrame).percent;
        return diff > diffThreshold;
      };

      if (isUniqueWithPrevious(prevPngFrame)) {
        uniqueBufferImages.push(bufferFrame);
        uniqueFrameCount++;
      }

      prevPngFrame = pngFrame;
    } catch (error) {
      console.error(`Failed to process ${framePath}:`, error);
    }
  }
  return uniqueBufferImages;
};

// Example usage
const exampleUsage = async () => {
  const videoBuffer = fs.readFileSync("dog.mp4");
  try {
    const uniqueImages = await processVideoBuffer(
      videoBuffer,
      outputUniqueDir,
      true
    );
    console.log("Unique images processed:", uniqueImages.length);
    // uniqueImages contains buffers of unique frames
  } catch (error) {
    console.error("Error processing video buffer:", error);
  }
};

exampleUsage();
