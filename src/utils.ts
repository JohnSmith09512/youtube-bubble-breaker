
export let timestampToSeconds = (timestamp)=>{
	let p = timestamp.split(':')
	let s = 0
	let m = 1
	while (p.length > 0) {
		s += m * parseInt(p.pop(), 10)
		m *= 60
	}
	return s
}

export let isElementVisible = (element)=>{
	let rectangle = element.getBoundingClientRect()
	let viewportWidth = window.innerWidth || document.documentElement.clientWidth
	let viewportHeight = window.innerHeight || document.documentElement.clientHeight

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

export let waitForPageLoad = async()=>{
	if(document.readyState == "complete") return;
	await new Promise((resolve, reject) => {
		let interval = setInterval(()=>{
			if(document.readyState == "complete"){
				clearInterval(interval)
				resolve(null)
			}
		}, 100)
	})
}

export let waitForQuerySelector = async(target, querySelector)=>{
	let element = target.querySelector(querySelector)
	if(!element){
		await new Promise((resolve, reject) => {
			let observer = new MutationObserver((mutations) => {
				for(let mutation of mutations){
					if(mutation.addedNodes.length){
						// Bad code
						element = element.querySelector(querySelector)
						if(element){
							resolve(null)
							return
						} 
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

