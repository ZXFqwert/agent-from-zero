import { chapterOneStories, chapterOneStory } from './chapterOneStory';
import { chapterTwoStories, chapterTwoStory } from './chapterTwo';
export const stories = [...chapterOneStories, ...chapterTwoStories];
export const uiStories = {...chapterOneStory, ...chapterTwoStory};
