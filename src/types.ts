

export type Channel = {
	id: string,
	name: string,
}

export type Video = {
	type: "video",
	element: HTMLElement,
	id: string,
	title: string,
	channelId: string,
	length: number,
	lengthWatched: number,
	feedbackTokens: {
		doNotRecommendChannel: string,
		notInterested: string
	}
}

export type Playlist = {
	type: "playlist",
	element: HTMLElement,
	id: string,
	title: string,
	feedbackTokens: {
		notInterested: string
	}
}

export type Media = Video | Playlist