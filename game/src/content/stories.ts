import { chapterOneStories, chapterOneStory } from './chapterOneStory';
import { chapterTwoStories, chapterTwoStory } from './chapterTwo';
import { chapterThreeStories, chapterThreeStory } from './chapterThree';
export const stories = [...chapterOneStories, ...chapterTwoStories, ...chapterThreeStories];
export const uiStories = {...chapterOneStory, ...chapterTwoStory, ...chapterThreeStory};
