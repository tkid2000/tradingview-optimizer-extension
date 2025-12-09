// Popup action event types
const reportUpdated = 'reportUpdated'

function escapeHtml(text) {
  if (!text) return text;
  return text
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const params = new Proxy(new URLSearchParams(window.location.search), {
  get: (searchParams, prop) => searchParams.get(prop),
});

let strategyID = params.strategyID;
var reportDetailData = [], reportDetailDataCSV = []
var $table = $('#table')

// update non-functional UI components for free/plus users
updateUserUI();

// Message handling
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  (async () => {
    const properties = Object.keys(message);
    const values = Object.values(message);
    // popupAction type defines popup html UI actions according to event type
    if (properties[0] === 'popupAction') {
      const popupAction = values[0];

      switch (popupAction.event) {
        case reportUpdated:
          if (popupAction.message.report.strategyID != strategyID) {
            // omit if strategyId does not match 
            break;
          }
          for (const [key, value] of Object.entries(popupAction.message.report.reportData)) {
            let reportDetail = {
              "parameters": escapeHtml(key),
              "netProfitAmount": value.netProfit.amount,
              "netProfitPercent": value.netProfit.percent,
              "maxDrawdownAmount": value.maxDrawdown.amount,
              "maxDrawdownPercent": value.maxDrawdown.percent,
              "closedTrades": value.closedTrades,
              "percentProfitable": value.percentProfitable,
              "profitFactor": value.profitFactor,
              "averageTradeAmount": value?.averageTrade.amount,
              "averageTradePercent": value?.averageTrade.percent,
              "avgerageBarsInTrades": value?.avgerageBarsInTrades,
            }
            let reportDetailCSV = { ...reportDetail }
            // Unwrap CSV values to raw for CSV generation (or keep them raw and escape only for HTML table)
            // But here we are building the object for the table AND CSV.
            // For CSV we want raw values usually.
            reportDetailCSV.parameters = key; // Keep raw for CSV

            value.detailedParameters.forEach((element, index) => {
              index += 1
              reportDetail['parameter' + index] = escapeHtml(element.value)
              reportDetailCSV[element.name] = element.value
            });
            reportDetailData.push(reportDetail)
            reportDetailDataCSV.push(reportDetailCSV)

            $table.bootstrapTable('removeByUniqueId', key);
            $table.bootstrapTable('prepend', reportDetail)

            let $newRow = $table.find(`tr[data-uniqueid="${key}"]`);
            $newRow.addClass('new-row-highlight');

          }
          break;

      }
    }
  })();

  return false;
});

chrome.storage.local.get("report-data-" + strategyID, function (item) {
  var timePeriodValue = Object.values(item)[0].timePeriod
  var values = Object.values(item)[0].reportData

  var detailedParameters = Object.values(values)[0].detailedParameters
  var timePeriod = document.querySelector("#timePeriod")
  timePeriod.textContent = timePeriodValue
  let isDeprecatedReportData = false;

  for (const [key, value] of Object.entries(values)) {
    if (value.averageTrade != null && value.averageTrade.amount != 0) {
      isDeprecatedReportData = true; // meaning it's old report data structure
    }

    let reportDetail = {
      "parameters": escapeHtml(key),
      "netProfitAmount": value.netProfit.amount,
      "netProfitPercent": value.netProfit.percent,
      "maxDrawdownAmount": value.maxDrawdown.amount,
      "maxDrawdownPercent": value.maxDrawdown.percent,
      "closedTrades": value.closedTrades,
      "percentProfitable": value.percentProfitable,
      "profitFactor": value.profitFactor,
      "averageTradeAmount": value?.averageTrade.amount,
      "averageTradePercent": value?.averageTrade.percent,
      "avgerageBarsInTrades": value?.avgerageBarsInTrades,
    }
    let reportDetailCSV = { ...reportDetail }
    reportDetailCSV.parameters = key; // Restore raw for CSV

    value.detailedParameters.forEach((element, index) => {
      index += 1
      reportDetail['parameter' + index] = escapeHtml(element.value)
      reportDetailCSV[element.name] = element.value
    });
    reportDetailData.push(reportDetail)
    reportDetailDataCSV.push(reportDetailCSV)
  }
  $table.bootstrapTable('showLoading')

  if (!isDeprecatedReportData) {
    // new report data doesn't have those values
    $table.bootstrapTable('hideColumn', 'averageTradeAmount');
    $table.bootstrapTable('hideColumn', 'averageTradePercent');
    $table.bootstrapTable('hideColumn', 'avgerageBarsInTrades');
  }

  setTimeout(() => {
    $table.bootstrapTable('load', reportDetailData)
    $table.bootstrapTable('hideLoading')
    hideDropDownParameters()
    detailedParameters.forEach((detailedParameter, index) => {
      let parameterName = `parameter${index + 1}`
      $table.bootstrapTable('showColumn', parameterName);
      $table.bootstrapTable('updateColumnTitle', {
        field: parameterName,
        title: detailedParameter.name
      })
      // update drop down parameter names accordingly and make them visible again
      document.querySelector(`input[data-field='${parameterName}']`).nextElementSibling.innerText = detailedParameter.name
      document.querySelector(`input[data-field='${parameterName}']`).parentElement.style.display = 'block'
    });
  }, 250);
  const $downloadReportButton = $('#download-report')

  $downloadReportButton.click(function () {
    downloadCSVReport(reportDetailDataCSV)
  })
});

// hides all drop down parameters initially
function hideDropDownParameters() {
  var dropdownLabels = document.querySelectorAll(".dropdown-menu-right label")
  for (let i = 0; i < dropdownLabels.length; i++) {
    var label = dropdownLabels[i]
    // omit all parameters columnn
    if (label.querySelector("input").getAttribute("data-field") == 'parameters') {
      continue;
    }
    // hide parameters on initial phase
    if (label.querySelector("input").getAttribute("data-field").startsWith("parameter")) {
      label.style.display = 'none'
    }
  }
}

// non-functional UI changes made with storage
function updateUserUI() {
  // show plus logo
  var logo = document.getElementById("normalLogo")
  logo.style.cssText = 'display:none !important';
  var plusLogo = document.getElementById("plusLogo")
  plusLogo.style.cssText = 'display:block !important'
  // remove plus upgrade button
  var plusUpgrade = document.getElementById("plusUpgrade")
  if (plusUpgrade) plusUpgrade.style.display = 'none'
}

function downloadCSVReport(reportDetailData) {
  const csv = convertReportToCSV(reportDetailData)
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `report-${strategyID}.csv`);

  link.click();
}

function convertReportToCSV(reportDetailData) {
  const keys = Object.keys(reportDetailData[0]);
  var result = keys.map((key) => {
    return key.toUpperCase();
  }).join(",") + "\n";

  for (var i = 0; i < reportDetailData.length; i++) {
    var line = [];
    for (var j = 0; j < keys.length; j++) {
      var value = reportDetailData[i][keys[j]];
      // Enclose the value with "" if contains comma, to preserve format
      if (typeof value === 'string' && value.indexOf(',') !== -1) {
        value = '"' + value + '"';
      }
      line.push(value);
    }
    result += line.join(",") + "\n";
  }
  return result;
}

// CustomSort function to handle non numeric chars and dash/hyphen confusion
function customSort(sortName, sortOrder, data) {
  var order = sortOrder === 'desc' ? -1 : 1
  data.sort(function (a, b) {
    var aa = ""
    var bb = ""
    // Check if number is negative with regex, rebuild and remove non-numeric chars
    if (a[sortName].charAt(0).match(/\D/) != null && a[sortName].charAt(0) != '+') {
      aa = '-' + a[sortName].substring(1, a[sortName].length)
      aa = +((aa + '').replace(/[^0-9.-]+/g, ""))
    } else {
      aa = +((a[sortName] + '').replace(/[^0-9.-]+/g, ""))
    }

    if (b[sortName].charAt(0).match(/\D/) != null && b[sortName].charAt(0) != '+') {
      bb = '-' + b[sortName].substring(1, b[sortName].length)
      bb = +((bb + '').replace(/[^0-9.-]+/g, ""))
    } else {
      bb = +((b[sortName] + '').replace(/[^0-9.-]+/g, ""))
    }

    if (aa < bb) {
      return order * -1
    }
    if (aa > bb) {
      return order
    }
    return 0
  })
}
