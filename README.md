# YouTube Bubble Breaker

![actions](/assets/logo.png)

Browser extension for automatically de-training YouTube suggestion algorithm from [filter bubble bias](https://en.wikipedia.org/wiki/Filter_bubble) to provide more diverse content suggestion.

## Install

Currently this addon is still under development. 

## Behaviours

On YouTube there are 2 ways of de-listing video from recomended feed, depending on certains behaviours of youtube algorithms one of those actions is chosen. 

![actions](/assets/actions.png)

Actions taken based on algorithm behaviour:

### Not Interested

- Channel mix of a channel that you already subscribed to 
- Video was already watched (watch time of over X%)
- Specific video recommended too often (based on impressions)

### Do Not Recommend Channel

- Video from channel recommended too often (based on impressions/interactions)
- Recommended video from a channel you already subscribed to