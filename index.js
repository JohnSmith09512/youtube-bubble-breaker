
let MAX_STORAGE_IMPRESSIONS_SIZE = 1024*1024*2
let TTL_SUBSCRIPTIONS = 1000 * 60 * 15 
let TTL_IMPRESSIONS = 1000 * 60 * 60 * 24 * 7
let THRESHOLD_INTERACTION_SCROLL = 1000 * 7
let THRESHOLD_VIDEO_IMPRESSIONS = 3
let THRESHOLD_MIX_IMPRESSIONS = 3
let THRESHOLD_CHANNEL_IMPRESSIONS = 7
let THRESHOLD_VIDEO_PROGRESS = 0.2
let STORAGE

let impressionCycleStarted = false
let impressionCycleIds = []
let scrollInteractionExposureTimeouts = []
let rateLimitTimeoutScroll
let rateLimitTimeoutMutation

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
	let media = []
	let selector = "ytd-rich-item-renderer"

	if(window.location.href.match(/youtube\.com\/watch/m)){ // Watching video
		selector = "ytd-compact-video-renderer"
	}

	for(let element of document.querySelectorAll(selector)){
		if(!element.querySelector("a.ytd-thumbnail")) continue; // ads

		let progress
		let channel
		let channelName
		let title
		let time
		let type = "video"

		let elementTitle = element.querySelector("#video-title-link yt-formatted-string") || element.querySelector("#video-title")
		if(elementTitle){
			title = elementTitle.getAttribute("title") || elementTitle.textContent
		}

		let elementTime = element.querySelector(".ytd-thumbnail-overlay-time-status-renderer")
		if(elementTime){
			time = elementTime.textContent
		}

		let elementChannel = element.querySelector(".ytd-channel-name a") 
		if(elementChannel){
			channel = elementChannel.getAttribute("href")
		}

		let elementChannelName = element.querySelector(".ytd-channel-name")
		if(elementChannelName){
			channelName = elementChannelName.getAttribute("")
		}

		let elementProgress = element.querySelector(".ytd-thumbnail-overlay-resume-playback-renderer") || element.querySelector("#progress")
		if(elementProgress){
			progress = Number(elementProgress.getAttribute("style").match(/width:\s*(\d+)\%/)[1]) / 100
		}

		if(!elementTime){
			type = "mix"
		}
		if(element.querySelector(".ytd-rich-grid-slim-media")){
			type = "movie"
		}
		
		media.push({
			id: element.querySelector("a.ytd-thumbnail").getAttribute("href").match(/\?v\=(.*?)(?:\&|$)/m)[1],
			type,
			time,
			channel,
			channelName,
			progress,
			title,
			element
		})
	}
	return media
}

function getAccount(){
	return Boolean(document.querySelector("ytd-masthead yt-img-shadow"))
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
				console.log(element)
				observer.disconnect()
				resolve()
			}
		})
		observer.observe(element, {childList: true, attributes: true})
	})
}

async function sendNotInterested(element){
	(await waitForQuerySelector(element, ".yt-icon-button")).click()
	await waitForPopup()
	let options = document.querySelectorAll("ytd-menu-popup-renderer ytd-menu-service-item-renderer")
	if(options.length == 1){
		options[0].click()
	}else{
		options[4].click()
	}
}

async function sendDontRecommendChannel(element){
	(await waitForQuerySelector(element, ".yt-icon-button")).click()
	await waitForPopup()
	document.querySelector("ytd-menu-popup-renderer ytd-menu-service-item-renderer:nth-child(5)").click()
}

async function expandSubscriptions(){
	(await waitForQuerySelector(document, "ytd-guide-section-renderer ytd-guide-collapsible-entry-renderer a")).click()
}

async function purge(){

	if(!getAccount()) return;

	await storageLoad()

	let scrollTop = document.querySelector("html").scrollTop

	if(window.location.href.match(/youtube\.com\/?$/m)){ // Main page
		
		// Updated list of subscriptions
		if(Number(new Date()) - Number(STORAGE.subscriptionsLastUpdated) > TTL_SUBSCRIPTIONS){
			await expandSubscriptions()
			STORAGE.subscriptions = getSubscriptions()
			STORAGE.subscriptionsLastUpdated = Number(new Date())
			storageCommit()
		}
	}

	if(window.location.href.match(/youtube\.com\/watch/m)){ // Watching video
	}

	for(let media of getMedia()){

		if(impressionCycleIds.indexOf(media.id) != -1) continue;

		impressionCycleIds.push(media.id)

		try{
			if(media.type == "video"){
				// Recommendation for a subscribed channel
				if(STORAGE.subscriptions.find(subscription=>subscription.url==media.channel)){
					await sendDontRecommendChannel(media.element)
				}
	
				// Channel got recommended too many times
				let impressionChannel = STORAGE.impressions[media.channel]
				if(impressionChannel && impressionChannel.impressions.length > THRESHOLD_CHANNEL_IMPRESSIONS){
					await sendDontRecommendChannel(media.element)
					delete STORAGE.impressions[media.channel]
					storageCommit()
				}
	
				// Video is already watched 
				if(media.progress > THRESHOLD_VIDEO_PROGRESS){
					await sendNotInterested(media.element)
				}
	
				// Video got recommended too many times
			}
	
			if(media.type == "mix"){
				// Mix of a channel you already subscribed to
				let match = media.title.match(/[^-]+ -\s*(.+)/m)
				if(match && STORAGE.subscriptions.find(subscription => subscription.name == match[1])){
					await sendNotInterested(media.element)
				}
	
			}
		}catch(error){
			console.log(media)
			console.error(error)
		}
	}

	document.querySelector("html").scrollTop = scrollTop
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

	// Pre sort old to new for optimization
	let sortedImpressions = Object.entries(STORAGE.impressions).sort(item=>item[1].updated).reverse() 

	let sortedImpressionsIndex = 0
	while(JSON.stringify(STORAGE.impressions).length > MAX_STORAGE_IMPRESSIONS_SIZE){
		let [impressionKey, impression] = sortedImpressions[sortedImpressionsIndex]
		delete STORAGE.impressions[impressionKey] 
		sortedImpressionsIndex += 1
	}

	for(let [impressionKey, impression] of Object.entries(STORAGE.impressions)){
		if(Number(new Date()) - impression.updated > TTL_IMPRESSIONS){
			delete STORAGE.impressions[impressionKey] 
		}
	}
	storageCommit()
}


// Log interactions based on if element is visible for certain amount of time
function observeScrollInteractions(){

	if(rateLimitTimeoutScroll){
		clearTimeout(rateLimitTimeoutScroll)
		for(let timeout of scrollInteractionExposureTimeouts){
			clearTimeout(timeout)
		}
	}

	rateLimitTimeoutScroll = setTimeout(()=>{
		for(let media of getMedia()){
			if(media.type != "video") continue;
			if(isElementVisible(media.element)){
				logImpression(media.id)
				logImpression(media.channel)
			}
		}
	}, 200)
}

let observer = new MutationObserver((mutations) => {
	for(let mutation of mutations){
		if(mutation.addedNodes.length){
			for(let addedNode of mutation.addedNodes){
				if(addedNode.childNodes.length && addedNode.classList.contains("ytd-rich-grid-media")){
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

function startImpressionCycle(){
	if(impressionCycleStarted) return;

	impressionCycleStarted = true

	document.addEventListener("scroll", observeScrollInteractions)
	observer.observe(document.body, {
		childList: true,
		subtree: true,
		attributes: true
	})
	purge()
}

function endImpressionCycle(){
	if(!impressionCycleStarted) return;

	impressionCycleStarted = false
	impressionCycleIds = []

	document.removeEventListener("scroll", observeScrollInteractions)
	observer.disconnect()
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
	await storageGarbageCollect()
	console.log(STORAGE)
	
	if(window.location.host == "www.youtube.com"){
		startImpressionCycle()
	}

	// There is no location change event, only way is to poll
	let previousLocation 
	setInterval(()=>{
		if(window.location != previousLocation){
			previousLocation = window.location

			endImpressionCycle()

			if(window.location.host == "www.youtube.com"){
				startImpressionCycle()
			}	
		}
	}, 100)

}

try{
	init()
}catch(error){
	console.log(error)
}


