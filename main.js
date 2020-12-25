require("dotenv").config();
const { Cluster } = require('puppeteer-cluster');
const fs = require("fs");
const HLS = require('hls-parser');
const axios = require("axios");

class App {
    constructor() {
        this.baseUrl = "https://www.everestimpact.live";
        this.allVideoUrls = [];
        this.videoDataResults = [];
        this.directVideoDataResults = [];
        this.vimeoVideoDataResults = [];
        this.youtubeVideoDataResults = [];
        this.invalidVideoDataResults = [];
    }
    log(text) {
        console.log("[INFO]",text);
    }

    createJsonFile(name, dataObject) {
        fs.writeFileSync(`./data/${name}.json`, JSON.stringify(dataObject, null, 2));
    }

    async init() {
        this.cluster = await Cluster.launch({
            concurrency: Cluster.CONCURRENCY_PAGE,
            maxConcurrency: parseInt(process.env.clusterMaxConcurrency),
            puppeteerOptions: {headless: Boolean(parseInt(process.env.headless)),  executablePath: process.env.chromeCanaryPath}
        });

        await this.cluster.execute(null, this.login);
        await this.cluster.execute(null, this.getAllVideoUrls);

        for (let videoUrlObject of this.allVideoUrls) {
            this.cluster.queue(videoUrlObject, this.getHlsVideoData)
        }

        await this.cluster.idle();
        await this.cluster.close();


        const notFound = this.allVideoUrls.filter(urlObj=>!this.videoDataResults.map(data=>data.videoUrl).includes(urlObj.href))
        console.log("not found", notFound.length);
        console.log(notFound.map(item=>item.href));

        this.createJsonFile("direct", this.directVideoDataResults);
        this.createJsonFile("vimeo", this.vimeoVideoDataResults);
        this.createJsonFile("youtube", this.youtubeVideoDataResults);
        this.createJsonFile("invalid", this.invalidVideoDataResults);
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
        const _tmpArray = await page.evaluate(()=>{
            const allHrefObjects = [];
            const allLabels = [...document.querySelectorAll("#past>div:nth-child(odd) h2")].map(item=>item.textContent);
            const groupsOfVideos = [...document.querySelectorAll("#past>div:nth-child(even)")]
                                        .map(node=>[...node.querySelectorAll(".video a")].map(node=>node.getAttribute('href')));
            groupsOfVideos.forEach((group, groupIdx)=>{
                group.reverse().forEach((href, idx) => {
                    allHrefObjects.push({
                        href,
                        label: allLabels[groupIdx],
                        idx: idx+1
                    });
                });
            });
            return allHrefObjects;
        });
        this.allVideoUrls = _tmpArray.map(obj=>{
            return {
                ...obj,
                href: this.baseUrl + obj.href
            }
        });
        this.log("Fetched all Video URLs");
    }


    getCookieData = async (url) => {
        const res = await axios.get(url);
        return res.headers["set-cookie"].filter(cookie=>cookie.match(/^cloudfront/i)).map(cookie=>cookie.split(";")[0]).reduce((res, cookie)=>`${res?res+"; ":res}${cookie}`);
    };

    getHlsVideoData = async ({page, data}) => {
        const videoUrl = data.href;
        const videoId = videoUrl.match(/\d+$/)[0]
        let videoData = {videoUrl: data.href, idx: data.idx, label: data.label, videoId};
        const response = await page.goto(videoUrl, {waitUntil: "load"})
        videoData.title = await page.evaluate(() => document.querySelector(".liveclasstitle").textContent);
        const ytLink = await page.evaluate(() => {
            const iframe = document.querySelector("#VideoHere iframe");
            if (!iframe) {
                return null;
            }
            const ytCookieUrl = iframe.getAttribute("src");
            if (!ytCookieUrl.includes("youtube")) {
                return null;
            }
            const ytVidId = ytCookieUrl.match(/embed\/(?:watch\?v=)?([a-zA-Z0-9_-]{11})\??/)[1];
            return `https://www.youtube.com/watch?v=${ytVidId}`;
        });
        if (parseInt((response.headers()).status) === 404) {
            videoData.src = null;
            videoData.comments = "404 page not found";
        } else if (ytLink) {
            videoData.src = ytLink;
        } else {
            await page.waitForSelector("#VideoHere", {visible: true});
            await page.click("#VideoHere>div");

            await page.waitForSelector("body > img", {timeout: 15000});
            const getCookieUrl = await page.evaluate(()=>document.querySelector("body > img").getAttribute("src"));
            const primaryPlaylistUrl =  decodeURIComponent(getCookieUrl.split("&stream=")[1].split("&fromWeb")[0].trim());

            if (primaryPlaylistUrl.includes("vimeo")) {
                videoData.src = primaryPlaylistUrl;
            } else {
                const cookie = await this.getCookieData(getCookieUrl);
                const headers = {cookie}
                const {data: primaryPlaylistData} = await axios.get(primaryPlaylistUrl, {headers});
                const primaryPlaylist = HLS.parse(primaryPlaylistData);
                let finalPlaylist, finalPlaylistUrl;
                if (primaryPlaylist.isMasterPlaylist) {
                    const bestQualityVariant = primaryPlaylist.variants.reduce((result, item) => {
                        if (item.bandwidth > result.bandwidth) {
                            return item;
                        } else {
                            return  result;
                        }
                    }, {bandwidth: 0})
                    const finalUrl = primaryPlaylistUrl.replace(/(?<=\/)[.\w]+$/, bestQualityVariant.uri);
                    const {data: finalPlaylistData} = await axios.get(finalUrl, {headers});
                    finalPlaylist = HLS.parse(finalPlaylistData);
                    finalPlaylistUrl = finalUrl;
                } else {
                    finalPlaylist = primaryPlaylist;
                    finalPlaylistUrl = primaryPlaylistUrl;
                }

                videoData.src = finalPlaylistUrl;
                videoData.cookie = cookie;
                videoData.segments = finalPlaylist.segments.length;
            }
        }

        this.videoDataResults.push(videoData);

        if (!videoData.src) {
            this.invalidVideoDataResults.push(videoData);
        } else if (videoData.src.includes("toprankers")) {
            this.directVideoDataResults.push(videoData);
        } else if (videoData.src.includes("vimeo")) {
            this.vimeoVideoDataResults.push(videoData);
        } else if (videoData.src.includes("youtube")) {
            this.youtubeVideoDataResults.push(videoData);
        }

        console.log(videoData);
        console.log("fetchedLinks",this.allVideoUrls.length, "total", this.videoDataResults.length, "direct", this.directVideoDataResults.length, "vimeo", this.vimeoVideoDataResults.length, "youtube", this.youtubeVideoDataResults.length, "invalid", this.invalidVideoDataResults.length);
    }

}

const main = async () => {
    const app = new App();
    await app.init()
};

main().catch(e=>console.log(e));
