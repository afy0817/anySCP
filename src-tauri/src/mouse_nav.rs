//! Mouse back/forward buttons on macOS.
//!
//! Logitech mice (MX Master via Logi Options+) send their side buttons as
//! swipe gestures instead of mouse buttons 4/5, and WKWebView never hands
//! swipe gestures to the page. A local event monitor catches them and emits a
//! `mouse-navigate` event ("back" | "forward"); the explorer routes it to the
//! pane under the pointer.

use std::ptr::NonNull;

use block2::RcBlock;
use objc2_app_kit::{NSEvent, NSEventMask, NSEventPhase, NSEventType};
use tauri::{AppHandle, Emitter};

/// Frontend event carrying "back" or "forward".
const EVENT: &str = "mouse-navigate";

/// Install the swipe monitor for the life of the app. Call on the main thread.
pub fn install(app: AppHandle) {
    let handler = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
        // SAFETY: AppKit passes a valid event for the duration of the call.
        let ev = unsafe { event.as_ref() };
        // A swipe can arrive as several phased events; act once, when it ends.
        // Positive deltaX is a swipe to the left — "back", as in Safari/Finder.
        if ev.r#type() == NSEventType::Swipe && ev.phase() == NSEventPhase::Ended {
            let direction = match ev.deltaX() {
                x if x > 0.0 => Some("back"),
                x if x < 0.0 => Some("forward"),
                _ => None,
            };
            if let Some(direction) = direction {
                let _ = app.emit(EVENT, direction);
            }
        }
        // Pass the event on unchanged.
        event.as_ptr()
    });

    // SAFETY: the handler always returns the valid event it was given.
    let monitor =
        unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::Swipe, &handler) };
    // Never removed: the monitor is needed for as long as the app runs.
    std::mem::forget(monitor);
}
