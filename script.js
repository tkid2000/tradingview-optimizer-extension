// Select all input values
var tvInputsQuery = OPTIPIE_SELECTORS.inputs.generated
var tvInputs = document.querySelectorAll(tvInputsQuery)
// user parameters and time frames
var userNumericInputs = [], userCheckboxInputs = [], userSelectableInputs = []
var userInputs = [] // combined user inputs of above
var userTimeFrames = [] // time frames chosen by the user
var optimizationHistory = new Map(); // holds whether parameter has been already optimized or not 
var maxProfit = -999999

// reportDataMessage defined globally and initiated from start
var reportDataMessage;

//parameter types
var ParameterType = {
    Selectable: "Selectable",
    Numeric: "Numeric",
    Checkbox: "Checkbox",
    DatePicker: "DatePicker" // not supported atm
}

const sleep = (ms) => new Promise((resolve) => {
    const handler = (event) => {
        if (event.data.type === "SleepEventComplete") {
            window.removeEventListener("message", handler);
            resolve();
        }
    };
    window.addEventListener("message", handler);
    // Notify injector.js about the sleep request with the delay
    window.postMessage({ type: "SleepEventStart", delay: ms }, "*");
});

async function waitForElement(selector, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const el = document.querySelector(selector);
        if (el) return el;
        await sleep(100);
    }
    throw new Error(`Element "${selector}" not found within ${timeout}ms`);
}

async function waitForCondition(predicate, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (predicate()) return true;
        await sleep(100);
    }
    throw new Error(`Condition failed within ${timeout}ms`);
}

// Run Optimization Process 
Process()

async function Process() {
    var shouldStop = false;
    //Construct UserInputs with callback
    var userInputsEventCallback = (event) => {
        let message = event.data
        if (message.type === "UserInputsEvent") {
            window.removeEventListener("message", userInputsEventCallback);

            for (let i = 0; i < message.detail.parameters.length; i++) {
                let parameter = message.detail.parameters[i];
                switch (parameter.type) {
                    case ParameterType.Numeric:
                        userNumericInputs.push(parameter)
                        break;
                    case ParameterType.Checkbox:
                        userCheckboxInputs.push(parameter)
                        break;
                    case ParameterType.Selectable:
                        userSelectableInputs.push(parameter)
                        break;
                }
                userInputs.push(parameter)
            }
            userTimeFrames = message.detail.timeFrames
        }
    }

    window.addEventListener("message", userInputsEventCallback);

    var stopOptimizationEventCallback = (event) => {
        var message = event.data
        if (message.type === "StopOptimizationEvent") {
            window.removeEventListener("message", stopOptimizationEventCallback)
            shouldStop = message.detail.event.isTrusted
        }
    }

    window.addEventListener("message", stopOptimizationEventCallback);

    //Wait for UserInputsEvent Callback
    await sleep(750)
    // sort userInputs before starting optimization 
    userNumericInputs.sort(function (a, b) {
        return a.parameterIndex - b.parameterIndex;
    });
    // Total Loop Size: Step(N) * Step(N+1) * ...Step(Nth)
    var ranges = [];

    // Create user input ranges with given step size for each parameter
    userNumericInputs.forEach((element, index) => {
        var range = 0
        // fix index for free users
        if (element.parameterIndex == -1) {
            element.parameterIndex = index
        }
        if (index == 0) {
            range = (element.end - element.start) / element.stepSize
            var roundedRange = Math.round(range * 100) / 100
            ranges.push(roundedRange)
        } else {
            range = ((element.end - element.start) / element.stepSize)
            var roundedRange = (Math.round(range * 100) / 100) + 1
            ranges.push(roundedRange)
        }
    });
    if (userTimeFrames == null || userTimeFrames.length <= 0) {
        // no time frame selection or free user flow
        reportDataMessage = prepareInitialReport()
        await OptimizeCheckboxes(() => OptimizeSelectables(() => OptimizeNumerics()))
        updateReport({ status: "FINISHED", isFinal: true })
        await PublishReport()
    } else {
        for (let i = 0; i < userTimeFrames.length; i++) {
            // open time intervals dropdown and change it
            const intervalsMenu = await waitForElement(OPTIPIE_SELECTORS.toolbar.intervalsMenu, 5000)
                .catch(() => document.querySelector(OPTIPIE_SELECTORS.toolbar.intervalsArrow)); // fallback

            intervalsMenu.click()

            let timeIntervalQuery = OPTIPIE_SELECTORS.toolbar.intervalItem(userTimeFrames[i][0])
            const intervalItem = await waitForElement(timeIntervalQuery);
            intervalItem.click()

            // Wait for chart to reload/settle - this is tricky without a specific signal, 
            // but we can at least wait for some indicators or just use a small safe delay 
            // combined with checking if the time frame text updated.
            await sleep(500) // Reduced from 1000, assuming 500ms is enough for most chart re-renders

            reportDataMessage = prepareInitialReport()
            try {
                await OptimizeCheckboxes(() => OptimizeSelectables(() => OptimizeNumerics()))
            } catch (err) {
                console.log(err)
                // catch the error, continue with the next time-frame
            }

            let isFinalOptimization = (i === userTimeFrames.length - 1)
            updateReport({ status: "FINISHED", isFinal: isFinalOptimization })
            await PublishReport()

            // reset global variables for new strategy optimization and for new timeframe
            optimizationHistory = new Map();
            maxProfit = -99999
        }
    }

    // Optimize numeric inputs in the strategey for the currently chosen timeframe
    async function OptimizeNumerics() {
        shouldStop = false;
        await SetUserIntervals()

        // Base call function
        const baseCall = async () => {
            for (let j = 0; j < ranges[0]; j++) {
                if (shouldStop) {
                    break;
                }
                await OptimizeParams(userNumericInputs[0].parameterIndex, userNumericInputs[0].stepSize);
            }
        };

        // Wrapper function for subsequent calls to build nested for loops
        const wrapSubsequentCalls = async (baseCall, index) => {
            if (index >= ranges.length) {
                // start executing after wrapping everything in place
                await baseCall()
                return;
            }

            const currentCall = async () => {
                for (let j = 0; j < ranges[index]; j++) {
                    if (shouldStop) {
                        break;
                    }
                    await baseCall();
                    await ResetInnerOptimizeOuterParameter(ranges, j, index);
                }
            };

            await wrapSubsequentCalls(currentCall, index + 1); // recursive call for the next level
        };

        // Function to execute nested loops
        const executeNestedLoops = async () => {
            await wrapSubsequentCalls(baseCall, 1); // Wrap and execute subsequent calls recursively starting from index 1
        };

        // Call the function to execute the nested loops
        await executeNestedLoops()
    }

    // Optimize checkbox inputs in the strategey for the currently chosen timeframe 
    async function OptimizeCheckboxes(nextFunction) {
        if (!isOptimizationCalled(userCheckboxInputs)) {
            if (nextFunction) {
                await nextFunction();
            }
            return
        }
        let checkBoxesLength = userCheckboxInputs.length

        for (let i = 0; i < 2 ** checkBoxesLength; i++) {
            let binaryString = i.toString(2).padStart(checkBoxesLength, '0')
            let binaryArray = binaryString.split('').map(Number)

            for (let j = 0; j < binaryArray.length; j++) {
                let value = binaryArray[j];
                // renew tv inputs
                tvInputs = document.querySelectorAll(tvInputsQuery)

                if (tvInputs[userCheckboxInputs[j].parameterIndex].checked && value == 0) {
                    tvInputs[userCheckboxInputs[j].parameterIndex].click()
                }
                if (!tvInputs[userCheckboxInputs[j].parameterIndex].checked && value == 1) {
                    tvInputs[userCheckboxInputs[j].parameterIndex].click()
                }
            }

            await sleep(100) // Reduced sleep, just to let UI events propagate

            if (nextFunction) {
                await nextFunction();
            }
            if (shouldStop) {
                return
            }
        }
    }

    // Optimize selectable inputs in the strategey for the currently chosen timeframe 
    async function OptimizeSelectables(nextFunction) {
        if (!isOptimizationCalled(userSelectableInputs)) {
            if (nextFunction) {
                await nextFunction();
            }
            return
        }

        // cartesian product to build up all selectable combinations
        let selectableInputCombinations = generateCombinationsFromInputs(userSelectableInputs)

        for (let i = 0; i < selectableInputCombinations.length; i++) {
            let selectableInputCombination = selectableInputCombinations[i]
            for (let j = 0; j < selectableInputCombination.length; j++) {
                let option = selectableInputCombination[j].option
                let parameterIndex = selectableInputCombination[j].parameterIndex
                // renew tv inputs
                tvInputs = document.querySelectorAll(tvInputsQuery)
                // open up dropdown
                tvInputs[parameterIndex].click()

                await sleep(500)
                let ddOptionsWrapper = document.querySelector("div[class*='mainContent' i]")
                let reactPropsKey = Object.keys(ddOptionsWrapper).find(key => key.includes("reactProps"));

                let ddOptions = ddOptionsWrapper[reactPropsKey].children.props.children
                // click on dropdown
                for (let i = 0; i < ddOptions.length; i++) {
                    const ddOptionVal = ddOptions[i].props.item.value
                    if (ddOptionVal === option) {
                        document.getElementById(ddOptions[i].props.id).click()
                        break
                    }
                }
                await sleep(250)
            }
            if (nextFunction) {
                await nextFunction();
            }
            if (shouldStop) {
                return
            }
        }
    }

    function generateCombinationsFromInputs(inputs) {
        const allOptions = inputs.map(input =>
            input.options.map(option => ({
                option,
                parameterIndex: input.parameterIndex
            }))
        );

        return allOptions.reduce((acc, current) => {
            return acc.flatMap(existing => current.map(opt => [...existing, opt]));
        }, [[]]);
    }


    function isOptimizationCalled(inputs) {
        if (inputs == null || inputs.length == 0) {
            return false;
        }
        return true;
    }

}

// PublishReport publishes the report after optimization is complete
async function PublishReport() {
    // Send Optimization Report to injector
    window.postMessage({ type: "ReportDataEvent", detail: reportDataMessage }, "*");
}

// prepareInitialReport populates initial report before starting a fresh optimization
function prepareInitialReport() {
    //Add ID, StrategyName, Parameters and MaxProfit to Report Message
    let strategyName = document.querySelector(OPTIPIE_SELECTORS.strategy.group)?.innerText
    let strategyTimePeriod = ""

    let timePeriodGroup = document.querySelectorAll(OPTIPIE_SELECTORS.strategy.timePeriodGroup)
    if (timePeriodGroup.length > 1) {
        selectedPeriod = timePeriodGroup[1].querySelector(OPTIPIE_SELECTORS.strategy.selectedPeriod)

        // Check if favorite time periods exist  
        if (selectedPeriod != null) {
            strategyTimePeriod = selectedPeriod.querySelector(OPTIPIE_SELECTORS.strategy.valueDiv)?.textContent
        } else {
            strategyTimePeriod = timePeriodGroup[1].querySelector(OPTIPIE_SELECTORS.strategy.valueDiv)?.textContent
        }
    }

    let title = document.querySelector("title")?.innerText
    let strategySymbol = title.split(' ')[0]

    let parametersList = []

    userInputs.forEach((element, index) => {
        let paramData = {
            name: element.parameterName || "Unknown",
            value: ""
        }

        switch (element.type) {
            case ParameterType.Numeric:
                paramData.value = element.start + "→" + element.end
                break;
            case ParameterType.Checkbox:
                paramData.value = "on/off"
                break;
            case ParameterType.Selectable:
                paramData.value = element.options
                break;
        }
        parametersList.push(paramData)
    })

    let reportDataMessage = {
        "strategyID": Date.now(),
        "created": Date.now(),
        "strategyName": strategyName,
        "symbol": strategySymbol,
        "timePeriod": strategyTimePeriod,
        "parameters": parametersList,
        "maxProfit": maxProfit, // NOT READY
        "reportData": [], // NOT READY
        "status": null, // NOT READY
    }

    return reportDataMessage
}

// Set User Given Intervals Before Optimization Starts
async function SetUserIntervals() {
    for (let i = 0; i < userNumericInputs.length; i++) {
        let userInput = userNumericInputs[i]
        let startValue = userInput.start - userInput.stepSize

        if (isFloat(startValue)) {
            let precision = getFloatPrecision(userInput.stepSize)
            startValue = fixPrecision(startValue, precision)
        }

        // reset by step size in case of a user input is as same as current tv input value 
        if (userInput.start == tvInputs[userInput.parameterIndex].value) {
            await OptimizeParams(userInput.parameterIndex, "-" + userInput.stepSize)
        } else {
            ChangeTvInput(tvInputs[userInput.parameterIndex], startValue)
        }

        await OptimizeParams(userInput.parameterIndex, userInput.stepSize)

        await sleep(50); // Minimal buffer
    }
    //TO-DO: Inform user about Parameter Intervals are set and optimization starting now.
}

// Optimize strategy for given tvParameterIndex, increment parameter, observe mutation 
async function OptimizeParams(tvParameterIndex, stepSize) {
    function newReportData() {
        return new Object({
            netProfit: {
                amount: 0,
                percent: ""
            },
            closedTrades: 0,
            percentProfitable: "",
            profitFactor: 0.0,
            maxDrawdown: {
                amount: 0,
                percent: ""
            },
            averageTrade: {
                amount: 0,
                percent: ""
            },
            avgerageBarsInTrades: 0,
            detailedParameters: []
        });
    }

    let reportData = newReportData();
    let optimizationResult = new Map();

    tvInputs[tvParameterIndex].dispatchEvent(new MouseEvent('mouseover', { 'bubbles': true }));

    // await sleep(150) -> removed, relying on next action or small debounce if needed

    // Calculate new step value
    let newStepValue = parseFloat(tvInputs[tvParameterIndex].value) + parseFloat(stepSize)
    if (isFloat(newStepValue)) {
        let precision = getFloatPrecision(stepSize)
        newStepValue = fixPrecision(newStepValue, precision)
    }
    ChangeTvInput(tvInputs[tvParameterIndex], newStepValue)

    // await sleep(200) -> removed, wait for OK button to be clickable/present

    // Click on "Ok" button
    const okButton = await waitForElement(OPTIPIE_SELECTORS.dialog.okButton[0], 2000)
        .catch(() => waitForElement(OPTIPIE_SELECTORS.dialog.okButton[1], 2000));

    okButton.click()

    let isBacktestUpdated = false
    // check if deep backtesting is enabled
    let isBacktestingOn = document.querySelector(OPTIPIE_SELECTORS.backtesting.deepBacktestingSpan) != null
    if (isBacktestingOn === true) {
        try {
            // Wait for update button to appear or check if it's already there
            let backtestUpdateButton = await waitForElement(OPTIPIE_SELECTORS.backtesting.updatedButton, 2000);
            backtestUpdateButton.click()
            isBacktestUpdated = true
        } catch (e) {
            // Update button might not appear if changes didn't trigger a deep backtest requirement?
            // Or maybe it takes longer. For now, we proceed as it was a "check if" logic.
        }
    }
    let observer;
    // Observe mutation for new Test results, validate it and save it to optimizationResults Map
    const p1 = new Promise((resolve, reject) => {
        observer = new MutationObserver(function (mutations) {
            mutations.every(function (mutation) {
                if (mutation?.type === 'characterData' && mutation?.target?.isConnected) {
                    // let reportContainer = mutation.target?.parentElement?.parentElement?.parentElement?.parentElement
                    // Assuming reportData logic is handled by ReportBuilder which queries DOM
                    var result = saveOptimizationReport(optimizationResult, reportData)
                    resolve(result)
                    observer.disconnect()
                    return false

                }
                return true
            });
        });

        let element = document.querySelector(OPTIPIE_SELECTORS.backtesting.deepHistory[0])
        if (element == null) {
            // fallback scenario for selector naming convention
            element = document.querySelector(OPTIPIE_SELECTORS.backtesting.deepHistory[1])
        }
        if (element) {
            let options = {
                childList: true,
                subtree: true,
                characterData: true,
                characterDataOldValue: true,
                attributes: true,
                attributeOldValue: true
            }
            observer.observe(element, options);
        } else {
            // If element is null, we can't observe. This is a critical failure.
            // We should probably throw or resolve as timedOut immediately, but existing logic waits.
            // We'll let p2 timeout handle it or try to find it again?
            // For now, if not found, we just wait for timeout.
        }

    });

    const p2 = new Promise((resolve, reject) => {
        setTimeout(() => {
            // expected error type, kind of warning
            if (observer) observer.disconnect()
            resolve({ timedOut: true })
        }, 15 * 1000); // 15s timeout
    });

    // Promise race the obvervation with 15 sec timeout in case of Startegy Test Overview window fails to load
    const finalOptimizationResult = await Promise.race([p1, p2])

    if (finalOptimizationResult?.timedOut) {
        // try to save if optimization data is the same as previous, after timeout
        let isReportDataEmpty = document.querySelector(OPTIPIE_SELECTORS.backtesting.emptyState) != null
        if (!isReportDataEmpty && implies(isBacktestingOn, isBacktestUpdated)) {
            saveOptimizationReport(optimizationResult, reportData)
        }
    }

    // await sleep(100) -> Removed, assuming state is ready or next Wait will handle it
    // Send single optimization result as a batch, update maxProfit and Optimization result before hand
    let optimizationResultsObject = Object.fromEntries(optimizationResult);

    updateReport({
        status: "IN_PROGRESS",
        maxProfit,
        reportData: optimizationResultsObject
    });
    PublishReport()

    // Re-open strategy settings window
    // Retry logic for reportTitleButton
    let reportTitleButton = null;
    try {
        reportTitleButton = await waitForElement(OPTIPIE_SELECTORS.strategy.reportTitleButton[0], 2000)
    } catch (e) {
        reportTitleButton = await waitForElement(OPTIPIE_SELECTORS.strategy.reportTitleButton[1], 2000)
    }

    reportTitleButton.click()
    // await sleep(50) -> removed

    // Settings Button logic
    let settingsButton = null;
    for (const selector of OPTIPIE_SELECTORS.strategy.settingsButton) {
        try {
            settingsButton = await waitForElement(selector, 500);
            if (settingsButton) break;
        } catch (e) { }
    }

    if (!settingsButton) throw new Error("Settings button not found");

    settingsButton.click()

    // Wait for inputs to be present before proceeding
    await waitForElement(tvInputsQuery, 2000);
    tvInputs = document.querySelectorAll(tvInputsQuery)
}

function saveOptimizationReport(optimizationResult, reportData) {
    let result = GetParametersFromWindow()
    let parameters = result.parameters
    if (!optimizationHistory.has(parameters) && parameters != "ParameterOutOfRange") {
        let error = ReportBuilder(reportData)
        if (error != null) {
            return error.message
        }
        reportData.detailedParameters = result.detailedParameters
        optimizationHistory.set(parameters, true)
        optimizationResult.set(parameters, reportData)
        //Update Max Profit
        replacedNDashProfit = reportData.netProfit.amount.replace("−", "-")
        profit = Number(replacedNDashProfit.replace(/[^0-9-\.]+/g, ""))
        if (profit > maxProfit) {
            maxProfit = profit
        }
        return ("Optimization param added to map")
    } else if (optimizationHistory.has(parameters)) {
        return ("Optimization param already exist " + parameters)
    } else {
        return ("Parameter is out of range, omitted")
    }
}

// Reset & Optimize (tvParameterIndex)th parameter to starting value  
async function resetAndOptimizeParameter(tvParameterIndex, resetValue, stepSize) {
    ChangeTvInput(tvInputs[tvParameterIndex], resetValue)
    await sleep(100) // Reduced sleep
    await OptimizeParams(tvParameterIndex, stepSize)
}

// Reset & Optimize Inner Loop parameter, Optimize Outer Loop parameter
async function ResetInnerOptimizeOuterParameter(ranges, rangeIteration, index) {
    let previousTvParameterIndex = userNumericInputs[index - 1].parameterIndex
    let currentTvParameterIndex = userNumericInputs[index].parameterIndex

    let resetValue = userNumericInputs[index - 1].start - userNumericInputs[index - 1].stepSize

    let previousStepSize = userNumericInputs[index - 1].stepSize
    let currentStepSize = userNumericInputs[index].stepSize
    //Reset and optimze inner
    await resetAndOptimizeParameter(previousTvParameterIndex, resetValue, previousStepSize)
    // Optimize outer unless it's last iteration
    if (rangeIteration != ranges[index] - 1) {
        await OptimizeParams(currentTvParameterIndex, currentStepSize)
    }
}

// Change TvInput value in Tv Strategy Options Window
function ChangeTvInput(input, value) {
    const event = new Event('input', { bubbles: true })
    const previousValue = input.value

    input.value = value
    input._valueTracker.setValue(previousValue)
    input.dispatchEvent(event)
}

// Get Currently active parameters from Tv Strategy Options Window and format them
function GetParametersFromWindow() {
    let parameters = "";
    let result = new Object({
        parameters: "",
        detailedParameters: []
    });
    for (let i = 0; i < userInputs.length; i++) {
        let userInput = userInputs[i]
        let parameterValue;
        switch (userInput.type) {
            case ParameterType.Numeric:
                if (userInput.start > parseFloat(tvInputs[userInput.parameterIndex].value) || parseFloat(tvInputs[userInput.parameterIndex].value) > userInput.end) {
                    parameters = "ParameterOutOfRange"
                    break
                }
                parameterValue = tvInputs[userInput.parameterIndex].value
                break;
            case ParameterType.Checkbox:
                if (tvInputs[userInput.parameterIndex].checked) {
                    parameterValue = "On"
                } else {
                    parameterValue = "Off"
                }
                break;
            case ParameterType.Selectable:
                parameterValue = tvInputs[userInput.parameterIndex].textContent
                break;
        }

        if (parameters == "ParameterOutOfRange") {
            // return this as an expected error, parameters are omitted for occurence 
            break;
        }

        if (i == userInputs.length - 1) {
            parameters += parameterValue
        } else {
            parameters += parameterValue + ", "
        }

        if (userInput.parameterName != null) {
            result.detailedParameters.push({
                name: userInput.parameterName,
                value: parameterValue,
            })
        }
    }
    result.parameters = parameters
    return result
}

// Build Report data from performance overview
function ReportBuilder(reportData) {
    let reportDataSelector;

    reportDataSelector = document.querySelectorAll(OPTIPIE_SELECTORS.backtesting.reportContainer)

    let valueSelector = OPTIPIE_SELECTORS.backtesting.reportValue
    let currencySelector = OPTIPIE_SELECTORS.backtesting.reportCurrency
    let changeSelector = OPTIPIE_SELECTORS.backtesting.reportChange

    // Safety check
    if (reportDataSelector.length < 5) return new Error("Report data not found");

    //1. Column
    reportData.netProfit.amount = reportDataSelector[0].querySelector(valueSelector)?.innerText + ' ' + (reportDataSelector[0].querySelector(currencySelector)?.innerText || '')
    reportData.netProfit.percent = reportDataSelector[0].querySelector(changeSelector)?.innerText
    //2. 
    reportData.maxDrawdown.amount = reportDataSelector[1].querySelector(valueSelector)?.innerText + ' ' + (reportDataSelector[1].querySelector(currencySelector)?.innerText || '')
    reportData.maxDrawdown.percent = reportDataSelector[1].querySelector(changeSelector)?.innerText
    //3.
    reportData.closedTrades = reportDataSelector[2].querySelector(valueSelector)?.innerText
    //4.
    reportData.percentProfitable = reportDataSelector[3].querySelector(valueSelector)?.innerText
    //4.
    reportData.profitFactor = reportDataSelector[4].querySelector(valueSelector)?.innerText
}

// Mutates (or adds) top-level fields on your global report object
function updateReport(updates) {
    reportDataMessage = { ...reportDataMessage, ...updates };
}

function implies(a, b) {
    return !a || b;
}

// isFloat to check whether given number is float or not
function isFloat(number) {
    if (String(number).includes(".")) {
        return true
    }
    return false
}

// getFloatPrecision to get precision of given float number
function getFloatPrecision(number) {
    if (isFloat(number)) {
        return String(number).split(".")[1].length
    } else {
        // default precision value
        return 2
    }

}

// fixPrecision handles js floating arithmetic precision problem
function fixPrecision(value, precision) {
    let multiplier = Math.pow(10, precision)
    return Math.round(value * multiplier) / multiplier
}
//Mutation Observer Code for console debugging purposes
/*
        var observer = new MutationObserver(function (mutations) {
            mutations.every(function (mutation) {
                if (mutation.type === 'characterData') {
                    if(mutation.oldValue != mutation.target.data){
                        console.log(mutation)
                        observer.disconnect()
                        return false
                    }
                }
                return true
            });
        });

        var element = document.querySelector("div[class*=backtesting][class*=deep-history]")
        let options = {
            attributes: false,
            childList: true,
            subtree: true,
            characterData: true,
            characterDataOldValue: true,
            attributes: true,
            attributeOldValue: true
        }
        observer.observe(element, options);
*/