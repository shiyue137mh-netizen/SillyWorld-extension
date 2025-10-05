'use strict';

import { SillyworldApp } from './modules/SillyworldApp.js';

function areApisReady() {
    const st = window.parent?.SillyTavern;
    if (!st) return false;

    return !!(
        st &&
        window.parent.TavernHelper &&
        window.parent.jQuery &&
        st.getContext &&
        st.getContext().eventSource
    );
}

const apiReadyInterval = setInterval(() => {
    console.log("Sillyworld Bridge: Checking for SillyTavern APIs...");
    if (areApisReady()) {
        clearInterval(apiReadyInterval);
        console.log("Sillyworld Bridge: APIs ready, initializing application.");
        new SillyworldApp();
    }
}, 500);