import * as youtubei from "youtubei.js"

import * as utils from "@/utils"
import * as types from "@/types"

export let innertube: youtubei.Innertube

export let getRecommendations = (): Array<types.Media>=>{
	let media: Array<types.Media> = []
	for(let [elementIndex, element] of Object.entries(document["wrappedJSObject"].querySelectorAll("ytd-rich-item-renderer"))){
		let item = (element as any).__data.data.content
		let itemType = Object.keys(item)[0]
		item = Object.values(item)[0]
		if(["videoRenderer", "radioRenderer"].indexOf(itemType) != -1){
			// Bypass permission access lol
			let menuItems = JSON.parse(JSON.stringify(item.menu.menuRenderer.items))
			let menuItemDoNotRecommendChannel = menuItems.find(menuItem=>menuItem.menuServiceItemRenderer.icon.iconType=="REMOVE")
			let menuItemNotInterested = menuItems.find(menuItem=>menuItem.menuServiceItemRenderer.icon.iconType=="NOT_INTERESTED")
			if(itemType == "videoRenderer"){
				let length = 0
				let lengthWatched = 0 
				if(item.lengthText){
					length = utils.timestampToSeconds(item.lengthText.simpleText)
				}
				if(item.thumbnailOverlays && item.thumbnailOverlays.length && item.thumbnailOverlays[0].thumbnailOverlayResumePlaybackRenderer){
					lengthWatched = Math.round(length * (item.thumbnailOverlays[0].thumbnailOverlayResumePlaybackRenderer.percentDurationWatched/100))
				}
				media.push({
					type: "video",
					element: element as HTMLElement,
					id: item.videoId,
					title: item.title.runs[0].text,
					channelId: item.owner.navigationEndpoint.browseEndpoint.browseId,
					length,
					lengthWatched,
					feedbackTokens: {
						doNotRecommendChannel: menuItemDoNotRecommendChannel.menuServiceItemRenderer.serviceEndpoint.feedbackEndpoint.feedbackToken,
						doNotRecommendChannelUndo: (
							menuItemDoNotRecommendChannel
								.menuServiceItemRenderer
								.serviceEndpoint
								.feedbackEndpoint
								.actions[0]
								.replaceEnclosingAction
								.item
								.notificationMultiActionRenderer
								.buttons[0]
								.buttonRenderer
								.serviceEndpoint
								.undoFeedbackEndpoint
								.undoToken
						),
						notInterested: menuItemNotInterested.menuServiceItemRenderer.serviceEndpoint.feedbackEndpoint.feedbackToken,
						notInterestedUndo: (
							menuItemNotInterested
								.menuServiceItemRenderer
								.serviceEndpoint
								.feedbackEndpoint
								.actions[0]
								.replaceEnclosingAction
								.item
								.notificationMultiActionRenderer
								.buttons[0]
								.buttonRenderer
								.serviceEndpoint
								.undoFeedbackEndpoint
								.undoToken
						)
					}
				})
			}else if(itemType == "radioRenderer"){
				media.push({
					type: "playlist",
					element: element as HTMLElement,
					id: item.playlistId,
					title: item.title.simpleText,
					feedbackTokens: {
						notInterested: menuItemNotInterested.menuServiceItemRenderer.serviceEndpoint.feedbackEndpoint.feedbackToken
					}
				})
			}
		}
	}
	return media
} 


export let getSubscriptions = (): Array<types.Channel>=>{
	let subscriptions = []
	let element = document["wrappedJSObject"].querySelector("#guide-renderer") as any
	let data = JSON.parse(JSON.stringify(element.__data.data))
	let items = []
	for(let item of data.items.find(item=>item.guideSubscriptionsSectionRenderer).guideSubscriptionsSectionRenderer.items){
		if(item.guideEntryRenderer){
			items.push(item.guideEntryRenderer)
		}else if (item.guideCollapsibleEntryRenderer){
			items = [...items, ...item.guideCollapsibleEntryRenderer.expandableItems.map(expandableItem=>expandableItem.guideEntryRenderer)]
		}
	}
	for(let item of items){
		if(!item.entryData) continue;
		subscriptions.push({
			id: item.entryData.guideEntryData.guideEntryId,
			name: item.formattedTitle.simpleText,
		})
	}
	return subscriptions
}

export let sendFeedback = async(feedbackTokens: Array<string>)=>{
	return await innertube.actions.execute("/feedback", {
		feedbackTokens,
		isFeedbackTokenUnencrypted: false
	})
}


export let init = async()=>{
	innertube = await youtubei.Innertube.create({
		client_type: "WEB" as any,
		cookie: document.cookie
	})
}