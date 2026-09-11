// The home hero hands its question to /ask through sessionStorage, NOT the
// URL. A ?q= contract would let anyone craft a link that makes a signed-in
// student's browser ask — i.e. spend money and write a thread — on page load;
// same-origin storage can only be written by our own pages, and /ask consumes
// (removes) the key on mount so a reload, even after a failed ask, never
// re-asks. Shared as its own module so the home page does not have to import
// the whole Ask surface for one string.
export const CARRIED_QUESTION_KEY = "classmind.ask.carried-question";
