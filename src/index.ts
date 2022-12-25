
import * as youtube from "@/youtube"
import * as storage from "@/storage"
import * as types from "@/types"
import * as utils from "@/utils"
import config from "@/config"

export let impressionCycleStarted = false
export let impressionCycleIds = []
export let scrollInteractionExposureTimeouts = []
export let rateLimitTimeoutScroll
export let rateLimitTimeoutMutation

// https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Build_a_cross_browser_extension

export let getAccount = ()=>{
	return Boolean(document.querySelector("ytd-masthead yt-img-shadow"))
}

export let logImpression = (key)=>{
	let now = Number(new Date())
	let impression = storage.edit().impressions[key] = {
		interactions: [],
		impressions: [],
		created: now,
		...storage.view().impressions[key],
		updated: now
	}
	impression.impressions.push(now)
}

export let logInteraction = (impressionKey, interaction={})=>{
	storage.edit().impressions[impressionKey].impressions.push(interaction)
}

export let logWord = (word)=>{
	if(!storage.view().words[word]){
		storage.edit().words[word] = 0
	}
	storage.edit().words[word] += 1
}

export let tokenizeTitle = (title)=>{
	return (title.match(/\b(\w{3,999})\b/g) || []).map(word=>word.toLowerCase())
}

export let titleRepetitiveness = (title)=>{
	let words = tokenizeTitle(title)
	let popularWords = Object.fromEntries(Object.entries(storage.view().words).sort((a,b)=>(a[1]<b[1]) as any).slice(15, 1000))
	let repetitiveness = 0

	for(let word of words){
		repetitiveness += popularWords[word] || 0
	}

	repetitiveness = repetitiveness / words.length

	return repetitiveness
}

export let removeMedia = async(feedbackType: "doNotRecommendChannel" | "notInterested", media: types.Media, reason: string)=>{
	if(media.element.querySelector(".ybb-placeholder")) return;
	// TODO: It is possible to send additional signals to the response feedback form
	if(feedbackType == "notInterested"){
		await youtube.sendFeedback([media.feedbackTokens["notInterested"]])
	}else if(feedbackType == "doNotRecommendChannel"){
		await youtube.sendFeedback([media.feedbackTokens["doNotRecommendChannel"]])
	}
	(media.element.querySelector("ytd-thumbnail") as HTMLElement).style["pointer-events"] = "none"
	let elementPlaceholder = document.createElement("div")
	elementPlaceholder.className = "ybb-placeholder"
	
	{
		let element = document.createElement("div")
		element.innerText = "Video removed from suggestions"
		elementPlaceholder.appendChild(element)
	}
	{
		let element = document.createElement("div")
		element.className = "reason"
		element.innerText = `Reason: ${reason}`
		elementPlaceholder.appendChild(element)
	}
	{
		let element = document.createElement("div")
		element.className = "action"
		element.innerText = "Undo"
		element.onclick = async()=>{
			console.log("undo")
			if(feedbackType == "notInterested" && media.feedbackTokens["notInterestedUndo"]){
				await youtube.sendFeedback([media.feedbackTokens["notInterestedUndo"]])
			}else if(feedbackType == "doNotRecommendChannel"){
				await youtube.sendFeedback([media.feedbackTokens["doNotRecommendChannelUndo"]])
			}
			(media.element.querySelector("ytd-thumbnail") as HTMLElement).style["pointer-events"] = ""
			elementPlaceholder.remove()
		}
		elementPlaceholder.appendChild(element)
	}
	media.element.querySelector("ytd-rich-grid-media").prepend(elementPlaceholder)
}

export let purge = async()=>{

	console.log("purge")

	if(!getAccount()) return;

	await storage.load()

	if(window.location.href.match(/youtube\.com\/?$/m)){ // Main page
		// Updated list of subscriptions
		if(Number(new Date()) - Number(storage.view().subscriptionsLastUpdated) > config.TTL_SUBSCRIPTIONS){
			storage.edit().subscriptions = youtube.getSubscriptions()
			storage.edit().subscriptionsLastUpdated = Number(new Date())
		}
	}

	if(window.location.href.match(/youtube\.com\/watch/m)){ // Watching video
	}

	for(let media of youtube.getRecommendations()){

		if(impressionCycleIds.indexOf(media.id) != -1) continue;
		impressionCycleIds.push(media.id)

		try{

			for(let word of tokenizeTitle(media.title)){
				logWord(word)
			}

			if(media.type == "video"){

				// Recommendation for a subscribed channel
				if(storage.view().subscriptions.find(subscription=>subscription.id==(media as types.Video).channelId)){
					await removeMedia("doNotRecommendChannel", media, "Video from a subscribed channel")
					continue
				}
	
				// Channel got recommended too many times
				let impressionChannel = storage.view().impressions[media.channelId]
				if(impressionChannel && impressionChannel.impressions.length > config.THRESHOLD_CHANNEL_IMPRESSIONS){
					await removeMedia("doNotRecommendChannel", media, "Channel recommended too often")
					delete storage.edit().impressions[media.channelId]
					continue
				}
	
				// Video is already watched 
				if((media.lengthWatched / media.length) > config.THRESHOLD_VIDEO_PROGRESS){
					await removeMedia("notInterested", media, "Video already watched")
					continue
				}
	
				// Video got recommended too many times
				let impressionVideo = storage.view().impressions[media.id]
				if(impressionVideo && impressionVideo.impressions.length > config.THRESHOLD_VIDEO_IMPRESSIONS){
					await removeMedia("notInterested", media, "Video recommended too often")
					delete storage.edit().impressions[media.id]
					continue
				}
			}
	
			if(media.type == "playlist"){
				// Playlist got recommended too many times
				let impressionVideo = storage.view().impressions[media.id]
				if(impressionVideo && impressionVideo.impressions.length > config.THRESHOLD_VIDEO_IMPRESSIONS){
					await removeMedia("notInterested", media, "Playlist recommended too often")
					delete storage.edit().impressions[media.id]
					continue
				}
			}

		}catch(error){
			console.log(media)
			console.error(error)
		}
	}

	storage.garbageCollect()
}

// Log interactions based on if element is visible for certain amount of time
export let observeScrollInteractions = ()=>{
	if(rateLimitTimeoutScroll){
		clearTimeout(rateLimitTimeoutScroll)
		for(let timeout of scrollInteractionExposureTimeouts){
			clearTimeout(timeout)
		}
	}
	rateLimitTimeoutScroll = setTimeout(()=>{
		for(let media of youtube.getRecommendations()){
			if(utils.isElementVisible(media.element)){
				logImpression(media.id)
				if(media.type == "video"){
					logImpression(media.channelId)
				}
			}
		}
	}, 200)
}

let observer = new MutationObserver((mutations) => {
	for(let mutation of mutations){
		if(mutation.addedNodes.length){
			for(let addedNode of mutation.addedNodes){
				if(addedNode.childNodes.length && (addedNode as HTMLElement).classList.contains("ytd-rich-grid-media")){
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

export let startImpressionCycle = ()=>{
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

export let endImpressionCycle = ()=>{
	if(!impressionCycleStarted) return;

	impressionCycleStarted = false
	impressionCycleIds = []

	document.removeEventListener("scroll", observeScrollInteractions)
	observer.disconnect()
}


export let init = async()=>{

	await utils.waitForPageLoad()
	await storage.load()
	await storage.garbageCollect()
	await youtube.init()

	console.log(storage.view())

	// console.log(Object.entries(storage.view().words).sort((a,b)=>a[1]<b[1] as any).slice(0, 100))
	
	if(window.location.host == "www.youtube.com"){
		startImpressionCycle()
	}

	// // There is no location change event, only way is to poll
	// let previousLocation 
	// setInterval(()=>{
	// 	if(window.location != previousLocation){
	// 		previousLocation = window.location

	// 		endImpressionCycle()

	// 		if(window.location.host == "www.youtube.com"){
	// 			startImpressionCycle()
	// 		}	
	// 	}
	// }, 100)

}


try{
	init()
}catch(error){
	console.log(error)
}