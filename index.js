
let TTL_SUBSCRIPTIONS = 1000 * 60 * 15 
let TTL_IMPRESSIONS = 1000 * 60 * 60 * 24 * 7
let THRESHOLD_INTERACTION_SCROLL = 1000 * 7
let THRESHOLD_VIDEO_IMPRESSIONS = 10
let THRESHOLD_MIX_IMPRESSIONS = 10
let THRESHOLD_CHANNEL_IMPRESSIONS = 10
let THRESHOLD_VIDEO_PROGRESS = 0.2
let STORAGE


function isElementVisible(element) {
	let rectangle = element.getBoundingClientRect()
	let viewportWidth = window.innerWidth || doc.documentElement.clientWidth
	let viewportHeight = window.innerHeight || doc.documentElement.clientHeight

	if(rectangle.right < 0 || rectangle.bottom < 0 || rectangle.left > viewportWidth || rectangle.top > viewportHeight) return false;

	return (
		element.contains(document.elementFromPoint(rectangle.left,  rectangle.top)) 
			||  
		element.contains(document.elementFromPoint(rectangle.right, rectangle.top)) 
			||
		element.contains(document.elementFromPoint(rectangle.right, rectangle.bottom)) 
			||
		element.contains(document.elementFromPoint(rectangle.left,  rectangle.bottom))
	)
}

function getSubscriptions(){
	let subscriptions = []
	for(let element of document.querySelector("ytd-guide-section-renderer:nth-child(2)").querySelectorAll("a.yt-simple-endpoint")){
		if(!element.getAttribute("href")) continue;
		subscriptions.push({
			url: element.getAttribute("href"),
			name: element.querySelector(".title").textContent
		})
	}
	return subscriptions
}

function getVideos(){
	let videos = []
	for(let element of document.querySelectorAll("ytd-browse ytd-rich-item-renderer")){
		if(!element.querySelector("a.ytd-thumbnail")) continue; // ads
		if(!element.querySelector(".ytd-channel-name a")) continue; // mixes
		let progress
		if(element.querySelector(".ytd-thumbnail-overlay-resume-playback-renderer")){
			progress = Number(element.querySelector(".ytd-thumbnail-overlay-resume-playback-renderer").getAttribute("style").match(/width:\s*(\d+)\%/)[1]) / 100
		}
		videos.push({
			id: element.querySelector("a.ytd-thumbnail").getAttribute("href").match(/\?v\=(.*?)(?:\&|$)/m)[1],
			channelUrl: element.querySelector(".ytd-channel-name a").getAttribute("href"),
			progress,
			element
		})
	}
	return videos
}

function getMixes(){
	let mixes = []
	for(let element of document.querySelectorAll("ytd-browse ytd-rich-item-renderer")){
		if(!element.querySelector("a.ytd-thumbnail")) continue; // ads
		if(element.querySelector(".ytd-channel-name a")) continue; // videos
		mixes.push({
			id: element.querySelector("a.ytd-thumbnail").getAttribute("href").match(/list\=(.*?)(?:\&|$)/m)[1],
			// channelName: element.querySelector(".ytd-channel-name a").getAttribute("href"),
		})
	}
	return mixes
}

function getMedia(){
	// TODO: all types of content: music playlists, mixes, videos, playlists, movies etc..
}

function logImpression(key){
	let now = Number(new Date())
	let impression = STORAGE.impressions[key] = {
		interactions: [],
		impressions: [],
		created: now,
		...STORAGE.impressions[key],
		updated: now
	}
	impression.impressions.push(now)
	storageCommit()
}

function logInteraction(impressionKey, interaction){
	STORAGE.impressions[impressionKey].impressions.push({

	})
	storageCommit()
}

async function waitForPopup(){
	let element = document.querySelector("ytd-menu-popup-renderer")
	if(element.offsetParent) return;
	await new Promise((resolve, reject) => {
		let observer = new MutationObserver((mutations) => {
			if(element.offsetParent){
				observer.disconnect()
				resolve()
			}
		})
		observer.observe(element, {childList: true, attributes: true})
	})
}

function locateMenuElement(videoId){
	for(let element of document.querySelectorAll("a.ytd-thumbnail")){
		if((element.getAttribute("href")||"").match(videoId)){
			return element.closest("ytd-rich-item-renderer").querySelector(".yt-icon-button")
		}
	}
}

async function sendNotInterested(videoId){
	locateMenuElement(videoId).click()
	await waitForPopup()
	document.querySelector("ytd-menu-popup-renderer ytd-menu-service-item-renderer:nth-child(4)").click()
}

async function sendDontRecommendChannel(videoId){
	locateMenuElement(videoId).click()
	await waitForPopup()
	document.querySelector("ytd-menu-popup-renderer ytd-menu-service-item-renderer:nth-child(5)").click()
}

async function expandSubscriptions(){
	(await waitForQuerySelector(document, "ytd-guide-section-renderer ytd-guide-collapsible-entry-renderer a")).click()
}

async function purge(){

	await storageLoad()

	if(window.location.href.match(/youtube\.com\/?$/m)){ // Main page
		
		// Updated list of subscriptions
		if(Number(new Date()) - Number(STORAGE.subscriptionsLastUpdated) > TTL_SUBSCRIPTIONS){
			await expandSubscriptions()
			STORAGE.subscriptions = getSubscriptions()
			STORAGE.subscriptionsLastUpdated = Number(new Date())
			storageCommit()
		}
	}

	let videos = getVideos()

	if(window.location.href.match(/youtube\.com\/watch/m)){ // Watching video
	}

	for(let video of videos){
		
		// Recommendation for a subscribed channel
		if(STORAGE.subscriptions.find(subscription=>subscription.url==video.channelUrl)){
			console.log(video)
			await sendDontRecommendChannel(video.id)
		}

		// Channel got recommended too many times
		let impressionChannel = STORAGE.impressions[video.channelUrl]
		if(impressionChannel && impressionChannel.impressions.length > THRESHOLD_CHANNEL_IMPRESSIONS){
			await sendDontRecommendChannel(video.id)
			delete STORAGE.impressions[video.channelUrl]
			storageCommit()
		}

		// Video is already watched 
		if(video.progress > THRESHOLD_VIDEO_PROGRESS){
			await sendNotInterested(video.id)
		}

		// Video got recommended too many times
	}

	storageGarbageCollect()
}

// TODO: rate limit
function storageCommit(){
	browser.storage.local.set({STORAGE})
}

async function storageLoad(){
	STORAGE = {
		subscriptions: [],	
		subscriptionsLastUpdated: 0,
		impressions: {},
		...(await browser.storage.local.get("STORAGE")).STORAGE
	}
}

function storageGarbageCollect(){
	// Remove unused data from storage 
	// extension storage is limited to only 5MB
	for(let [impressionKey, impression] of Object.entries(STORAGE.impressions)){
		if(Number(new Date()) - impression.updated > TTL_IMPRESSIONS){
			delete STORAGE.impressions[impressionKey] 
		}
		// TODO: sort by updated/created and prune if X MB threshold is reached
	}
	storageCommit()
}

let scrollInteractionExposureTimeouts = []
let rateLimitTimeoutScroll

// Log interactions based on if element is visible for certain amount of time
function observeScrollInteractions(){

	if(rateLimitTimeoutScroll){
		clearTimeout(rateLimitTimeoutScroll)
		for(let timeout of scrollInteractionExposureTimeouts){
			clearTimeout(timeout)
		}
	}

	rateLimitTimeoutScroll = setTimeout(()=>{
		for(let video of getVideos()){
			if(isElementVisible(video.element)){
				logImpression(video.id)
				logImpression(video.channelUrl)
			}
		}
		console.log(STORAGE)
	}, 200)
}

let observer = new MutationObserver((mutations) => {
	for(let mutation of mutations){
		if(mutation.addedNodes.length){
			for(let addedNode of mutation.addedNodes){
				if(addedNode.childNodes.length && addedNode.childNodes[0].classList.contains("ytd-rich-item-renderer")){
					// New video loaded, but we need to wait a bit for others to load
					if(rateLimitTimeoutMutation){
						clearTimeout(rateLimitTimeoutMutation)
					}
					rateLimitTimeoutMutation = setTimeout(purge, 200)
				}
			}
		}
	}
})

let impressionCycleBegun = false

function beginImpressionCycle(){
	try{
		purge()
	}catch(error){
		console.log(error)
	}
	impressionCycleBegun = true
	document.addEventListener("scroll", observeScrollInteractions)
	observer.observe(document.body, {
		childList: true,
		subtree: true
	})
}

function endImpressionCycle(){
	if(impressionCycleBegun){
		impressionCycleBegun = false
		document.removeEventListener("scroll", observeScrollInteractions)
		observer.disconnect()
	}
}

async function waitForPageLoad(){
	if(document.readyState == "complete") return;
	await new Promise((resolve, reject) => {
		let interval = setInterval(()=>{
			if(document.readyState == "complete"){
				clearInterval(interval)
				resolve()
			}
		}, 100)
	})
}

async function waitForQuerySelector(target, querySelector, interval){
	let element = target.querySelector(querySelector)
	if(!element){
		await new Promise((resolve, reject) => {
			let observer = new MutationObserver((mutations) => {
				for(let mutation of mutations){
					if(mutation.addedNodes.length){
						// Bad code
						element = element.querySelector(querySelector)
						if(element) return resolve()
					}
				}
			})
			observer.observe(target, {
				childList: true,
				subtree: true
			})
		})
	}
	return element
}

async function init(){

	await waitForPageLoad()

	await storageLoad()
	console.log(STORAGE)
	
	if(window.location.host == "www.youtube.com"){
		beginImpressionCycle()
	}

	// There is no location change event, only way is to poll
	let previousLocation 
	setInterval(()=>{
		if(window.location != previousLocation){
			previousLocation = window.location

			endImpressionCycle()

			if(window.location.host == "www.youtube.com"){
				beginImpressionCycle()
			}	
		}
	}, 100)

}

try{
	init()
}catch(error){
	console.log(error)
}


