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
            this.cluster.queue(videoUrlObject.href, this.getHlsVideoData)
        }

        await this.cluster.idle();
        await this.cluster.close();


        const notFound = this.allVideoUrls.filter(urlObj=>!this.videoDataResults.map(data=>data.videoUrl).includes(urlObj.href))
        console.log("not found", notFound.length);
        console.log(notFound);

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
            // [...document.querySelectorAll(".video a")].map(node=>node.getAttribute('href'))
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

    getHlsVideoData = async ({page, data: videoUrl}) => {

        // const tmpArr = [
        //     'https://www.everestimpact.live/ssc-cgl-tier-ii-descriptive-class-1-2164151',
        //     'https://www.everestimpact.live/data-analysis-8-1858641',
        //     'https://www.everestimpact.live/data-analysis-7-1853864',
        //     'https://www.everestimpact.live/completion-of-figures-2362593',
        //     'https://www.everestimpact.live/embeded-figures-2359121',
        //     'https://www.everestimpact.live/reasoning-2356187',
        //     'https://www.everestimpact.live/classification-odd-man-out-2-2335592',
        //     'https://www.everestimpact.live/classification-odd-man-out-2332848',
        //     'https://www.everestimpact.live/word-formation-2-2295672',
        //     'https://www.everestimpact.live/word-formation-2293174',
        //     'https://www.everestimpact.live/find-the-missing-number-3-2284067',
        //     'https://www.everestimpact.live/find-the-missing-number-2-2280708',
        //     'https://www.everestimpact.live/find-the-missing-number-2277130',
        //     'https://www.everestimpact.live/coding-and-decoding-5-2273151',
        //     'https://www.everestimpact.live/coding-and-decoding-4-2269490',
        //     'https://www.everestimpact.live/coding-and-decoding-3-2262953',
        //     'https://www.everestimpact.live/coding-and-decoding-2-2257919',
        //     'https://www.everestimpact.live/coding-and-decoding-2255311',
        //     'https://www.everestimpact.live/logical-order-of-words-3-2253026',
        //     'https://www.everestimpact.live/logical-order-of-words-2-2250594',
        //     'https://www.everestimpact.live/logical-order-of-words-2217549',
        //     'https://www.everestimpact.live/seating-arrangement-class-4-2213201',
        //     'https://www.everestimpact.live/seating-arrangement-class-3-2210149',
        //     'https://www.everestimpact.live/seating-arrangement-class-2-2206741',
        //     'https://www.everestimpact.live/ranking-test-class-3-2202466',
        //     'https://www.everestimpact.live/ranking-test-class-2-2197550',
        //     'https://www.everestimpact.live/reasoning-ganesh-sir-2190790',
        //     'https://www.everestimpact.live/syllogism-by-raj-kumar-sir-2185793',
        //     'https://www.everestimpact.live/syllogism-by-raj-kumar-sir-2182274',
        //     'https://www.everestimpact.live/data-sufficiency-rajkumar-sir-2178598',
        //     'https://www.everestimpact.live/ranking-test-2175813',
        //     'https://www.everestimpact.live/venn-diagrams-3-2170466',
        //     'https://www.everestimpact.live/venn-diagrams-2-2162990',
        //     'https://www.everestimpact.live/data-sufficiency-rajkumar-sir-2156862',
        //     'https://www.everestimpact.live/venn-diagrams-2151498',
        //     'https://www.everestimpact.live/analogy-part-5-2145351',
        //     'https://www.everestimpact.live/analogy-part-4-2142100',
        //     'https://www.everestimpact.live/analogy-part-3-2134929',
        //     'https://www.everestimpact.live/analogy-2-ganesh-sir-2131683',
        //     'https://www.everestimpact.live/analogy-ganesh-sir-2122903',
        //     'https://www.everestimpact.live/analogy-ganesh-sir-2119439',
        //     'https://www.everestimpact.live/symbols-and-notations-2104757',
        //     'https://www.everestimpact.live/reasoning-letter-series-2-ganesh-sir-1936908',
        //     'https://www.everestimpact.live/cube-2085908',
        //     'https://www.everestimpact.live/clocks-class-2-2072881',
        //     'https://www.everestimpact.live/reasoning-clocks-rajkumar-sir-1980727',
        //     'https://www.everestimpact.live/demo-reasoning-ganesh-sir-1966088',
        //     'https://www.everestimpact.live/live-reasoning-letter-series-ganesh-sir-1913756',
        //     'https://www.everestimpact.live/reasoning-class-2-1903217',
        //     'https://www.everestimpact.live/reasoning-number-series-1882100',
        //     'https://www.everestimpact.live/live-calenders-1821731',
        //     'https://www.everestimpact.live/live-coding-decoding-2-1657591',
        //     'https://www.everestimpact.live/ssc-cglchsl-tier-1-g-s-mock-test-6-explanation-2386949',
        //     'https://www.everestimpact.live/ssc-cglchsl-tier-1-maths-mock-test-6-explanation-2386947',
        //     'https://www.everestimpact.live/ssc-cglchsl-tier-1-reasoning-mock-test-4-explanation-2347007',
        //     'https://www.everestimpact.live/ssc-cglchsl-tier-1-reasoning-mock-test-1-explanation-2306201',
        //     'https://www.everestimpact.live/mock-18-g-s-explanation-2267480',
        //     'https://www.everestimpact.live/mock-23-reasoning-explanation-2216706',
        //     'https://www.everestimpact.live/ssc-cgl-tier-1-mock-20-g-s-2107273',
        //     'https://www.everestimpact.live/ssc-cgl-tier-1-mock-test-16-explanation-1927615',
        //     'https://www.everestimpact.live/ssc-cgl-tier-i-mock-test-15-explanation-1895717',
        //     'https://www.everestimpact.live/ssc-cgl-tier-1-mock-test-14-explanation-1867764',
        //     'https://www.everestimpact.live/geography-4-2162987',
        //     'https://www.everestimpact.live/trigonometry-maxima-minima-2130380',
        //     'https://www.everestimpact.live/trignometry-heights-distances-2-2124841',
        //     'https://www.everestimpact.live/trignometry-heights-distances-2120732',
        //     'https://www.everestimpact.live/trignometry-10-2114742',
        //     'https://www.everestimpact.live/trignometry-9-2103330',
        //     'https://www.everestimpact.live/trignometry-8-2099280',
        //     'https://www.everestimpact.live/trignometry-7-2096147',
        //     'https://www.everestimpact.live/trignometry-6-2091308',
        //     'https://www.everestimpact.live/trigonometry-5-2085907',
        //     'https://www.everestimpact.live/trignometry-class-4-2072858',
        //     'https://www.everestimpact.live/trignometry-class-3-2069172',
        //     'https://www.everestimpact.live/trignometry-class-2-2065541',
        //     'https://www.everestimpact.live/trignometry-class-1-rajkumar-sir-2060568',
        //     'https://www.everestimpact.live/algebra-15-2058819',
        //     'https://www.everestimpact.live/algebra-15-2046109',
        //     'https://www.everestimpact.live/algebra-13-2037613',
        //     'https://www.everestimpact.live/algebra-12-2032993',
        //     'https://www.everestimpact.live/algebra-11-2028569',
        //     'https://www.everestimpact.live/algebra-10-rajkumar-sir-2014207',
        //     'https://www.everestimpact.live/algebra-9-rajkumar-sir-2010752',
        //     'https://www.everestimpact.live/algebra-8-rajkumar-sir-2000783',
        //     'https://www.everestimpact.live/algebra-7-rajkumar-sir-1996035',
        //     'https://www.everestimpact.live/algebra-6-algebra-rajkumar-sir-1981813',
        //     'https://www.everestimpact.live/algebra-class-4-1975534',
        //     'https://www.everestimpact.live/algebra-4-algebra-rajkumar-sir-1970821',
        //     'https://www.everestimpact.live/algebra-class-3-rajkumar-sir-1967160',
        //     'https://www.everestimpact.live/algebra-class-1-2031588',
        //     'https://www.everestimpact.live/mensuration-3d-class-2-1941958',
        //     'https://www.everestimpact.live/mensuration-3d-class-1-1936881',
        //     'https://www.everestimpact.live/mensuration-class-8',
        //     'https://www.everestimpact.live/mensuration-class-8-1909556',
        //     'https://www.everestimpact.live/mensuration-6-1901276',
        //     'https://www.everestimpact.live/mensuration-class-5-1885487',
        //     'https://www.everestimpact.live/mensuration-class-4-1880016',
        //     'https://www.everestimpact.live/mensuration-class-3-1876052',
        //     'https://www.everestimpact.live/mensuration-class-2-1871063',
        //     'https://www.everestimpact.live/mensuration-class-1-1867753']
        // if (!tmpArr.includes(videoUrl)) {
        //     return
        // } else {
        //     console.log("IM HEREE")
        // }

        let videoData = {videoUrl};
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

            await page.waitForSelector("body > img", {timeout: 4000});
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
