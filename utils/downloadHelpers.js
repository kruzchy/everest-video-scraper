const fs = require("fs");
const pLimit = require('p-limit');
const limit = pLimit(1);
const path = require("path");
const {} = require("worker_threads")
const filenamify = require('filenamify');
const {spawn} = require("child_process")
class DownloadHelper {
    rootPath = ".."
    constructor() {
        this.failedVideos = [];
        this.allVideoData = [];
        this.finishedCount = 0;
        this.failedCount = 0;
    }

    createDirectoryIfNotExists = (directory) => {
        try {
            fs.accessSync(directory, fs.constants.F_OK);
        } catch (e) {
            fs.mkdirSync(directory);
        }
    }

    downloadDirectVideo =  (videoData) => {

        let {src, label, idx, title, videoUrl, segments} = videoData;
        title = filenamify(title, {replacement: "-"});
        const fileName = `${idx}_${title}.mp4`
        this.createDirectoryIfNotExists(path.resolve(this.rootPath, "videos"));
        this.createDirectoryIfNotExists(path.resolve(this.rootPath, "videos", label));
        const numThreads = 8
        const finalFilePath = path.resolve(this.rootPath, "videos", label, fileName);
        videoData.finalFilePath = finalFilePath;

        console.log("[INFO]Trying to download", title, label);

        const command = `streamlink --hls-segment-threads ${numThreads} "${src}" best -o "${finalFilePath}" --force`
        // const command = `streamlink --http-header cookie="${cookie}" --hls-segment-threads ${numThreads} "${src}" best -o "${finalFilePath}" --force`
        const streamlinkCmd = spawn(command, {shell: true});
        return new Promise((resolve => {
            let stdoutMsg = '';
            streamlinkCmd.stdout.on("data", (data)=>{
                stdoutMsg += data.toString('utf8');
            });
            streamlinkCmd.stderr.on("data", (data)=>{
                stdoutMsg += data.toString('utf8');
            });
            streamlinkCmd.on('close', (code) => {
                code = parseInt(code);
                if (code===0) {
                    this.finishedCount += 1;
                    console.log("[INFO]",`Successfully downloaded`, {videoUrl, fileName});
                    console.log("total", this.allVideoData.length, "finished", this.finishedCount, "failed", this.failedCount);
                } else {
                    this.failedCount += 1;
                    this.failedVideos.push(videoData);
                    console.log("[ERROR]", `Download Failed`, videoData, stdoutMsg);
                    console.log("total", this.allVideoData.length, "finished", this.finishedCount, "failed", this.failedCount);
                }
                resolve();
            });
        }));


    };

    downloadAllDirectVideos = async () => {
        this.allVideoData = JSON.parse(fs.readFileSync(path.resolve(this.rootPath, "data", "vimeo.json"), "utf8"));
        const downloadVideoPromieses = [];
        for (let data of this.allVideoData) {
            downloadVideoPromieses.push(limit(()=>this.downloadDirectVideo(data)));
        }
        await Promise.all(downloadVideoPromieses);
    }
}


const main = async ()=>{
    const data = {
        "videoUrl": "https://www.everestimpact.live/copy-averages-pyq-2-2136736",
        "idx": 48,
        "label": "ARITHMETIC",
        "videoId": "2136736",
        "title": "dummy",
        "src": "https://www.youtube.com/watch?v=h6b5nh7id9o"
    };
    const app = new DownloadHelper();
    await app.downloadAllDirectVideos();
    // await app.downloadDirectVideo(data)
};
main();
