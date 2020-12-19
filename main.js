require("dotenv").config();
const puppeteer = require('puppeteer');
const { Cluster } = require('puppeteer-cluster');
const fs = require("fs");

class App {
    constructor() {
        this.baseUrl = "https://www.everestimpact.live";
        this.videoDataResults = [];
        this.allVideoUrls = [];
        this.invalidVideos = 0;
    }
    log(text) {
        console.log("[INFO]",text);
    }
    async init() {
        this.cluster = await Cluster.launch({
            concurrency: Cluster.CONCURRENCY_PAGE,
            maxConcurrency: parseInt(process.env.clusterMaxConcurrency),
            puppeteerOptions: {headless: Boolean(process.env.headless),  executablePath: process.env.chromeCanaryPath}
        });

        await this.cluster.execute(null, this.login);
        await this.cluster.execute(null, this.getAllVideoUrls);

        for (let videoUrl of this.allVideoUrls) {
            this.cluster.queue(videoUrl, this.getHlsVideoData)
        }

        await this.cluster.idle();
        await this.cluster.close();


        fs.writeFileSync("./data/hlsList.json", JSON.stringify(this.videoDataResults.filter(result=>result.src && result.src.includes("toprankers")), null, 2));
        fs.writeFileSync("./data/hlsListVimeo.json", JSON.stringify(this.videoDataResults.filter(result=>result.src && result.src.includes("vimeo")), null, 2));


    }



     waitAndClick = async (page, selector) => {
        await page.waitForSelector(selector, {visible: true});
        await page.click(selector);
    };

    login = async ({page}) => {
        await page.goto("https://www.everestimpact.live/");
        await this.waitAndClick(page, "#js-header .btn-default");
        await page.waitForSelector("#txt_login_email", {visible: true});
        await page.type("#txt_login_email", process.env.everestUsername);
        await page.type("#txt_login_password", process.env.everestPassword);
        await page.click("#logintab > div.EmailLogin > div.LoginBtn > button");
        await page.waitForSelector(".profilepic", {visible: true})
        this.log("Logged In");
    }

    getAllVideoUrls = async ({page}) => {
        await page.goto("https://www.everestimpact.live/everest-offline");
        const _tmpArray = await page.evaluate(()=>[...document.querySelectorAll(".video a")].map(node=>node.getAttribute('href')));
        this.allVideoUrls = _tmpArray.map(href=>this.baseUrl+href);
        this.log("Fetched all Video URLs");
    }



    getHlsVideoData = async ({page, data: videoUrl}) => {
        await page.goto(videoUrl);
        await page.waitForSelector("#VideoHere", {visible: true});
        await page.click("#VideoHere>div");

        const title = await page.evaluate(()=>document.querySelector(".liveclasstitle").textContent);
        let videoData;
        try {
            const m3u8Request = await page.waitForResponse(req => req.url().match(/\.m3u8\?/), {timeout: 5000});
            const src = m3u8Request._url
            videoData = {src, title, videoUrl};
        } catch (e) {
            videoData = {src:null, title, videoUrl};
            this.invalidVideos++
        }
        this.videoDataResults.push(videoData);
        console.log(videoData);
        console.log("total", this.videoDataResults.length, "invalid", this.invalidVideos);
    }

}

const main = async () => {
    const app = new App();
    await app.init()
};

main().catch(e=>console.log(e));
