const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const { Readable } = require("stream");
const Jimp = require("jimp");

ffmpeg.setFfmpegPath(ffmpegPath);

const originalFramesDir = "original_frames";
const outputUniqueDir = "unique_frames";
const diffThreshold = 0.3;
const newWidth = 640; // Desired width
const newHeight = 360; // Desired height

// Create directories if they don't exist
if (!fs.existsSync(originalFramesDir)) {
  fs.mkdirSync(originalFramesDir);
}
if (!fs.existsSync(outputUniqueDir)) {
  fs.mkdirSync(outputUniqueDir);
}

const processVideoBuffer = (buffer, outputUniqueDir, isSaved) => {
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
            originalFramesDir,
            outputUniqueDir
          );

          //   Delete original frames
          fs.readdir(originalFramesDir, (err, files) => {
            if (err) throw err;
            for (const file of files) {
              fs.unlink(path.join(originalFramesDir, file), (err) => {
                if (err) throw err;
              });
            }
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

const filterUniqueFrames = async (originalFramesDir, outputUniqueDir) => {
  const frameFiles = fs
    .readdirSync(originalFramesDir)
    .filter((file) => file.endsWith(".png"));

  let prevImage = null;
  let uniqueFrameCount = 0;
  const uniqueImages = [];

  const framesLength = frameFiles.length;

  for (let i = 0; i < framesLength; i++) {
    const framePath = path.join(originalFramesDir, frameFiles[i]);
    try {
      const img = await Jimp.read(framePath);

      if (prevImage) {
        const diff = Jimp.diff(prevImage, img).percent;

        if (diff > diffThreshold) {
          const buffer = await img.getBufferAsync(Jimp.MIME_PNG);

          uniqueImages.push(buffer);

          uniqueFrameCount++;
        }
      } else {
        const buffer = await img.getBufferAsync(Jimp.MIME_PNG);
        uniqueImages.push(buffer);

        uniqueFrameCount++;
      }
      prevImage = img;
    } catch (error) {
      console.error(`Failed to process ${framePath}:`, error);
    }
  }
  return uniqueImages;
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
