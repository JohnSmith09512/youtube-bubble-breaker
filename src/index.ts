
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
		storage.view().words[word] = 0
	}
	storage.view().words[word] += 1
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

export let removeMedia = (media: types.Media)=>{
	let elementPlaceholder = document.createElement("div")
	elementPlaceholder.className = "ybb-placeholder"
	{
		let element = document.createElement("div")
		element.innerText = media.title
		elementPlaceholder.appendChild(element)
	}
	{
		let element = document.createElement("div")
		element.innerText = "Removed"
		elementPlaceholder.appendChild(element)
	}
	media.element.childNodes[0].replaceWith(elementPlaceholder)
}

export let purge = async()=>{

	if(!getAccount()) return;

	await storage.load()

	let scrollTop = document.querySelector("html").scrollTop

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
					await youtube.sendFeedback([media.feedbackTokens.doNotRecommendChannel])
					removeMedia(media)
				}
	
				// Channel got recommended too many times
				let impressionChannel = storage.view().impressions[media.channelId]
				if(impressionChannel && impressionChannel.impressions.length > config.THRESHOLD_CHANNEL_IMPRESSIONS){
					await youtube.sendFeedback([media.feedbackTokens.doNotRecommendChannel])
					delete storage.edit().impressions[media.channelId]
					removeMedia(media)
				}
	
				// Video is already watched 
				if((media.lengthWatched / media.length) > config.THRESHOLD_VIDEO_PROGRESS){
					await youtube.sendFeedback([media.feedbackTokens.notInterested])
					removeMedia(media)
				}
	
				// Video got recommended too many times
			}
	
			// if(media.type == "playlist"){
			// 	let match = media.title.match(/[^-]+ -\s*(.+)/m)
			// 	if(match && storage.view().subscriptions.find(subscription => subscription.name == match[1])){
			// 		await sendNotInterested(media.element)
			// 	}
	
			// }
		}catch(error){
			console.log(media)
			console.error(error)
		}
	}

	// document.querySelector("html").scrollTop = scrollTop
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
			if(media.type != "video") continue;
			if(utils.isElementVisible(media.element)){
				logImpression(media.id)
				logImpression(media.channelId)
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