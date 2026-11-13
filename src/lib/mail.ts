// The app's live state and every mail action. The code lives in ./mail/ (one file per part); this file gathers
// what the rest of the app uses, so `import { ... } from '../lib/mail'` works as it always has.
// Parts: store (state, toasts), messages (saving emails), bodies, views (selection, search), accounts, sync,
// actions, calendar, contacts, outbox (undo send, send later), timers and start (start up).
export { NO_FILTERS, activeFilterCount, broadcast, countsFor, dismissToast, providerFor, setFilters, toast, useMail } from './mail/store';
export type { ListFilters, Toast } from './mail/store';
export { importMessages, refreshTaskbarCount, reloadMessagesFromDb } from './mail/messages';
export { getAttachmentData, loadBody, looksGarbled, refetchBody, savedCopy, warmBodies, warmInbox } from './mail/bodies';
export { adoptRemote, goBack, goForward, localSearch, messagesInThread, openScreen, runSearch, selectThread, setView } from './mail/views';
export type { Place } from './mail/views';
export type { SavedSignIn } from './mail/accounts';
export { addGoogleAccount, addGoogleAccountStrict, addImapAccountStrict, addMicrosoftAccount, addMicrosoftAccountStrict, applyPalette, editAccount, forgetKeptAccount, keptAccounts, leaveDemo, reconnectAccount, removeAccount, reorderAccounts, restoreSignIns, savedSignIns, setLeaveOutOfAll, startDemo, updateAccount } from './mail/accounts';
export { isSyncing, refreshAll, restartSync, syncAccount } from './mail/sync';
export { addFollowup, applyLabel, archive, blockSender, idsForKeys, latestPerConversation, markRead, markSpam, markViewRead, moveToInbox, moveToLabel, restoreFromBin, selectedMessageIds, snooze, toggleFlag, toggleMute, toggleVip, trash, unblockSender, unsnooze, unsubscribe } from './mail/actions';
export { addInviteToCalendar, answerEvent, answerInvite, applyPatch, calendarChoices, canAddToCalendar, canMoveAcross, createNewEvent, deleteEvent, dismissReminders, editEvent, eventCopy, eventsBetween, inviteStatus, lastEventsRefresh, moveEventAcross, recentlyDeletedEvent, refreshEvents, updateAddedEvent, writableCalendars } from './mail/calendar';
export { addToContacts, contactAccounts, refreshAccountPhotos, refreshContacts } from './mail/contacts';
export { adoptOutboxItem, announceQueued, cancelSend, editScheduled, flushOutbox, notYetSent, queueSend, registerSender, rescheduleSend, syncWakes, unschedule } from './mail/outbox';
export { restartPolling, stopTimers, warmAfterStart } from './mail/timers';
export { initMail } from './mail/start';
