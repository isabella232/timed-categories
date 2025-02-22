/* global getMetaData, setMetaData, setAnswer, goToNextField, fieldProperties, getPluginParameter */

var complete = false // {bool} If field is complete, then don't set up the even listeners, so a fast respondent can't change their answer
var selectable = true // Whether choices can still be selected
var allowedKeys = [] // Each goes into an array so it can be confirmed a legitimate keyboard key was pressed
var choices = fieldProperties.CHOICES
var numChoices = choices.length
var missedValue = choices[numChoices - 1].CHOICE_VALUE // {string} Value to be saved when time runs out before a choice can be selected
var startTime = Date.now() // {number} Time code when the field starts
var timeStart // {number} How much time the timer should start with. To be set by field plug-in parameter
var timeLeft // {number} How much time is left on the timer
var metadata = getMetaData()
var timeUnit // {string} Time unit to be displayed
var timeDivider // {number} Based on the timeUnit, what the ms time will be divided by for display to the user
var selectedCorrect = 0 // This starts with a value of 0, but if the correct answer is selected, it is assigned a value of 1, and added to the metadata

var durationStart = getPluginParameter('duration')
var allowContinue = getPluginParameter('continue')
var allowchange = getPluginParameter('allowchange')
var allowkeys = getPluginParameter('allowkeys')
var allowclick = getPluginParameter('allowclick')
var hidekeys = getPluginParameter('hidekeys')
var correctVal = getPluginParameter('correct')

if (typeof correctVal === 'string') { // Make lowercase to match more common choice values
  correctVal = correctVal.toLocaleLowerCase()
}

var timerContainer = document.querySelector('.timer-container')
var timeNumberContainer = timerContainer.querySelector('.timer')

var timerCircle = document.querySelector('.timer-circle')

var keyContainers = document.querySelectorAll('#key') // {Array<Element>} Where the key to press will be displayed
var clickAreas = document.querySelectorAll('.main-cell') // {Array<Element>} Clickable areas
var choiceLabelContainers = document.querySelectorAll('.choice-label') // {Array<Element>} Used later to unEntity

var tdObj = {} // Key is the choice value, and value is the corresponding TD element. Used to highlight the element later
for (var e = 0; e < numChoices; e++) {
  var thisElement = clickAreas[e]
  var elementId = thisElement.id.substr(7) // Remove the "choice-" from the ID to get the choice value
  tdObj[elementId] = thisElement
}

clickAreas[numChoices - 1].style.display = 'none' // Hide the "pass" element

if ((hidekeys === 1) || (allowkeys === 0)) { // Hide the keys to press if the user prefers
  var keyRows = document.querySelectorAll('.key-row')
  var numKeyRows = keyRows.length
  for (var r = 0; r < numKeyRows; r++) {
    keyRows[r].style.display = 'none'
  }
}

if (allowContinue === 0) {
  allowContinue = false
} else {
  allowContinue = true
}

if (allowchange === 0) {
  allowchange = false
} else {
  allowchange = true
}

for (let c = 0; c < numChoices - 1; c++) {
  // Might as well un-entity while here
  var labelContainer = choiceLabelContainers[c]
  labelContainer.innerHTML = unEntity(labelContainer.innerHTML)

  // Stores choice values (aka the accepted keys) into an array so the field knows when an actually assigned key has been pressed.
  var choice = choices[c]
  if (choice.CHOICE_SELECTED) {
    complete = true // If a choice has been selected, then the field is complete, which might lead to some of the event listeners not being created. That way, a fast respondent cannot change their answer
  }
  var key = choice.CHOICE_VALUE
  allowedKeys.push(key)
  keyContainers[c].innerHTML = key.toUpperCase()
}

if (complete && !allowchange) { // Already answered and cannot change
  selectable = false
  goToNextField()
} else if ((metadata != null) && !allowContinue) { // They were here before, and not allowed to continue
  if (!complete) { // Field was not answered last time
    setAnswer(missedValue)
    selectable = false // Not allowed to change
    complete = true
  }
  goToNextField()
} else if (durationStart == null) { // Field is not timed
  if (metadata == null) {
    setMetaData('1') // Set metadata so the field later knows it was already there, just in case.
  }
} else { // COMMON: The field is timed, and can work on field
  timerContainer.style.display = ''
  setUnit()
  if (metadata == null) { // COMMON: Starting with a fresh page
    timeStart = durationStart * 1000 // Converts to ms
  } else {
    var lastLeft // {number} Time remaining from last time. Will remove the time passed since last at the field
    var sepMetadata = metadata.match(/[^ ]+/g) // List is space-separated, so use regex to get it here
    if (sepMetadata.length > 2) {
      selectedCorrect = sepMetadata[2]
    }
    timeStart = parseInt(sepMetadata[0])
    lastLeft = parseInt(sepMetadata[1])
    var timeSinceLast = Date.now() - lastLeft
    timeStart -= timeSinceLast // Remove time spent away from the field
    if (timeStart <= 0) { // If the time remaining is 0 or less, then skip ahead. This is to keep the original metadata.
      selectable = false
      if (!complete) { // Time has run out, so if there is no set answer, then set one.
        setAnswer(missedValue)
        complete = true // Probably not necessary here, but good in case update later.
      }
      goToNextField()
    }
  }
}

if (selectable && (allowclick !== 0)) { // Set up click/tap on region
  for (var tdNum = 0; tdNum < numChoices - 1; tdNum++) {
    var clickArea = clickAreas[tdNum]
    clickArea.addEventListener('click', function (e) {
      var eventTarget = e.currentTarget
      var choiceId = eventTarget.id.substr(7)
      choiceSelected(choiceId)
    })
  }
}

if (selectable && (allowkeys !== 0)) { // Set up keyboard event listener if allowed
  document.addEventListener('keyup', keypress)
}

if ((durationStart != null) && selectable) {
  timerCircle.style.animation = String(durationStart) + 's' + ' circletimer linear forwards'
  timerCircle.style.animationDelay = '-' + String(Math.ceil(durationStart - (timeStart / 1000))) + 's' // Delay in case returning to field
  setInterval(timer, 1)
}

/**
 * Runs as much as possible. Takes the current time stamp with the starting time stamp, and determines how much time is remaining. When time runs out, move on to the next field.
 */
function timer () {
  if (selectable) {
    var timeNow = Date.now()
    timeLeft = startTime + timeStart - timeNow
    setMetaData(String(timeLeft) + ' ' + String(timeNow) + (correctVal == null ? '' : ' ' + String(selectedCorrect))) // Save the time, so if the respondent leaves and comes back, can remove the time passed so far, as well as the time passed while they were gone. If there is a correct value, then add if the selected value is correct or not.
  }

  if (timeLeft < 0) { // Stop the timer when time runs out. Using <0 instead of <=0 so does not keep setting the answer and going to the next field, and will only do it once.
    timeLeft = 0
    if (!complete) {
      setAnswer(missedValue)
      complete = true
    }
    selectable = false
    goToNextField()
  }
  timeNumberContainer.innerHTML = String(Math.ceil(timeLeft / timeDivider, 0)) // Set time display
}

/**
 * Called when a keyboard key is pressed
 * @param {Event} e Key press event, used to get key pressed
 */
function keypress (e) {
  var key = e.key
  choiceSelected(key)
} // End keypress

/**
 * Check the key pressed (or box clicked), and make sure it is a valid choice value. If it is, highlight the corresponding box, set the field value, quick pause to see highlighting, and move on to the next field
 * @param {string} choiceValue Value of box clicked, or key pressed
 */
function choiceSelected (choiceValue) { // When a box is clicked or a key is pressed
  if (selectable) {
    if (choiceValue === ' ') { // If the spacebar was pressed, then that corresponds to the "space" choice value
      choiceValue = 'space'
    }
    var selectedCol = allowedKeys.indexOf(choiceValue)
    if (selectedCol !== -1) {
      var highlightElement = tdObj[choiceValue] // Find element to highlight
      if (correctVal == null) { // There is no "correct" answer
        highlightElement.classList.add('tapped') // Highlight the corresponding cell to show what was selected
      } else { // Will show if selection was correct
        selectedCorrect = 1
        var checkElement = document.createElement('div')
        checkElement.classList.add('correct-symbol')
        if (correctVal === choiceValue) {
          highlightElement.classList.add('correct')
          checkElement.appendChild(document.createTextNode(String.fromCharCode(0x2713)))
        } else {
          selectedCorrect = 0
          highlightElement.classList.add('wrong')
          checkElement.appendChild(document.createTextNode(String.fromCharCode(0x2717)))
        }
        highlightElement.appendChild(checkElement)
      }

      setAnswer(choiceValue)
      selectable = false
      complete = true // Probably not needed by this point, since "complete" is not used once a choice is selected, but will keep for now.
      setTimeout(
        function () {
          goToNextField()
        }, 200)
    }
  }
}

/**
 * Used to display time with preferred unit
 */
function setUnit () {
  timeUnit = getPluginParameter('unit')
  if (timeUnit === 'ms') {
    timeDivider = 1
  } else if (timeUnit === 'cs') {
    timeDivider = 10
  } else if (timeUnit === 'ds') {
    timeDivider = 100
  } else {
    timeUnit = 's'
    timeDivider = 1000
  }
}

/**
 * Takes HTML entities for < and >, and replaces them with the actual characters so HTML styling can be taken from field references
 * @param {string} str String that should be unentitied
 * @returns {string}
 */
function unEntity (str) {
  return str.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

/**
 * Clear the current answer, starting over
 */
function clearAnswer () {
  setAnswer('')
  startTime = Date.now()
}
