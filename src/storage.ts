import * as types from "@/types"
import config from "@/config"

export type SchemaSTORAGE = {
	subscriptions: Array<types.Channel>,
	subscriptionsLastUpdated: Number,
	impressions: {[impressionKey: string]: {
		interactions: Array<any>,
		impressions: Array<any>,
		created: number,
		updated: number
	}},
	words: {[word: string]: number},
}

export let STORAGE: SchemaSTORAGE = {} as any

// TODO: rate limit
export let commit = ()=>{
	browser.storage.local.set({STORAGE: STORAGE as any})
}

export let load = async()=>{
	STORAGE = {
		subscriptions: Array<{
			id: string
		}>,	
		subscriptionsLastUpdated: 0,
		impressions: {},
		words: {},
		...(await browser.storage.local.get("STORAGE")).STORAGE as any
	}
}

export let view = (): SchemaSTORAGE=>{
	return STORAGE
}

export let editTimeout 
export let edit = (): SchemaSTORAGE=>{
	if(editTimeout){
		clearTimeout(editTimeout)
	}
	editTimeout = setTimeout(()=>{
		commit()
		editTimeout = null
	}, 500)
	return STORAGE
}

export let garbageCollect = ()=>{
	// Remove unused data from storage 
	// extension storage is limited to only 5MB

	// Pre sort old to new for optimization
	let sortedImpressions = Object.entries(STORAGE.impressions).sort((a, b)=>(a[1].updated>b[1].updated) as any)

	let sortedImpressionsIndex = 0
	while(JSON.stringify(STORAGE.impressions).length > config.MAX_STORAGE_IMPRESSIONS_SIZE){
		let [impressionKey, impression] = sortedImpressions[sortedImpressionsIndex]
		delete STORAGE.impressions[impressionKey] 
		sortedImpressionsIndex += 1
	}

	for(let [impressionKey, impression] of Object.entries(STORAGE.impressions)){
		if(Number(new Date()) - impression.updated > config.TTL_IMPRESSIONS){
			delete STORAGE.impressions[impressionKey] 
		}
	}
	commit()
}
