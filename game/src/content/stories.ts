import { chapterFiveStories, chapterFiveStory } from './chapterFive';
import { chapterOneStories, chapterOneStory } from './chapterOneStory';
import { chapterTwoStories, chapterTwoStory } from './chapterTwo';
import { chapterThreeStories, chapterThreeStory } from './chapterThree';
import { chapterFourStories, chapterFourStory } from './chapterFour';
export const stories = [...chapterOneStories, ...chapterTwoStories, ...chapterThreeStories, ...chapterFourStories,...chapterFiveStories];
export const uiStories = {...chapterOneStory, ...chapterTwoStory, ...chapterThreeStory,...chapterFourStory,...chapterFiveStory};
