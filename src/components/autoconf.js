/**
  FoxyProxy
  Copyright (C) 2006-2008 Eric H. Jung and LeahScape, Inc.
  http://foxyproxy.mozdev.org/
  eric.jung@yahoo.com

  This source code is released under the GPL license,
  available in the LICENSE file at the root of this installation
  and also online at http://www.gnu.org/licenses/gpl.txt
**/

// See http://forums.mozillazine.org/viewtopic.php?t=308369

//dump("autoconf.js\n");
if (!CI) {
  // we're not being included by foxyproxy.js
  var CI = Components.interfaces, CC = Components.classes, CR = Components.results, fp;

  // Get attribute from node if it exists, otherwise return |def|.
  // No exceptions, no errors, no null returns.
  var gGetSafeAttr = function(n, name, def) {
    n.QueryInterface(CI.nsIDOMElement);
    return n ? (n.hasAttribute(name) ? n.getAttribute(name) : def) : def;
  };
  // Boolean version of GetSafe
  var gGetSafeAttrB = function(n, name, def) {
    n.QueryInterface(CI.nsIDOMElement);
    return n ? (n.hasAttribute(name) ? n.getAttribute(name)=="true" : def) : def;
  };
  // XPCOM module initialization
  var NSGetModule = function() { return AutoConfModule; }
}

///////////////////////////// AutoConf class ///////////////////////
function AutoConf(owner, fpp) {
  this.wrappedJSObject = this;
  fp = fpp || CC["@leahscape.org/foxyproxy/service;1"].getService().wrappedJSObject;    
  this.timer = CC["@mozilla.org/timer;1"].createInstance(CI.nsITimer);
  this.owner = owner;
	this._resolver = new nsProxyAutoConfig();
}

AutoConf.prototype = {
  parser : /\s*(\S+)\s*(?:([^:]+):?(\d*)\s*[;]?\s*)?/,
  status : 0,
  error : null,
 	loadNotification: true,
  errorNotification: true,
  url: "",
  _pac: "",
  _autoReload: false,
  _reloadFreqMins: 60,

  QueryInterface: function(aIID) {
    if (!aIID.equals(CI.nsISupports))
      throw CR.NS_ERROR_NO_INTERFACE;
    return this;
  },
    
  set autoReload(e) {
    this._autoReload = e;
    if (!e && this.timer) {
			this.timer.cancel();
		}
   },

  get autoReload() {return this._autoReload;},

  set reloadFreqMins(e) {
  	if (isNaN(e) || e < 1) {
  		e = 60;
  	}
  	else {
	    this._reloadFreqMins = e;
	  }
   },
  get reloadFreqMins() {return this._reloadFreqMins;},

  fromDOM : function(n) {
    this.url = gGetSafeAttr(n, "url", "");
    this.loadNotification = gGetSafeAttrB(n, "loadNotification", true);
    this.errorNotification = gGetSafeAttrB(n, "errorNotification", true);
    this._autoReload = gGetSafeAttrB(n, "autoReload", false);
    this._reloadFreqMins = gGetSafeAttr(n, "reloadFreqMins", 60);
  },

  toDOM : function(doc) {
    var e = doc.createElement("autoconf");
    e.setAttribute("url", this.url);
    e.setAttribute("loadNotification", this.loadNotification);
    e.setAttribute("errorNotification", this.errorNotification);
	  e.setAttribute("autoReload", this._autoReload);
	  e.setAttribute("reloadFreqMins", this._reloadFreqMins);
    return e;
  },

  loadPAC : function() {
    this._pac = "";
    try {
      var req = CC["@mozilla.org/xmlextras/xmlhttprequest;1"]
        .createInstance(CI.nsIXMLHttpRequest);
      req.open("GET", this.url, false); // false means synchronous
      req.send(null);
      this.status = req.status;
      if (this.status == 200 || (this.status == 0 && (this.url.indexOf("file://") == 0 || this.url.indexOf("ftp://") == 0 || this.url.indexOf("relative://") == 0))) {
        try {
          this._pac = req.responseText;
          this._resolver.init(this.url, this._pac);
          this.loadNotification && fp.notifier.alert(fp.getMessage("pac.status"), fp.getMessage("pac.status.success", [this.owner.name]));
          this.owner._enabled = true; // Use _enabled so we don't loop infinitely
          this.error = null;
        }
        catch(e) {
          this._pac = "";
          this.badPAC("pac.status.error", e);
        }
      }
      else {
        this.badPAC("pac.status.loadfailure");
      }
    }
    catch(e) {
      this.badPAC("pac.status.loadfailure", e);
    }
  },

	notify : function(timer) {
		// nsITimer callback
		this.loadPAC();
	},
  
  cancelTimer : function() {
    this.timer.cancel();
  },

  badPAC : function(res, e) {
		if (e) {
      dump("badPAC: " + e + "\n");
      this.error = e;
    }
    this.errorNotification && fp.notifier.alert(fp.getMessage("pac.status"), fp.getMessage(res, [this.owner.name, this.status, this.error]));
    if (this.owner.lastresort)
      this.owner.mode = "direct"; // don't disable!
    else
      this.owner.enabled = false;
  }
};

var AutoConfFactory = {
  createInstance: function (aOuter, aIID) {
    if (aOuter != null)
      throw CR.NS_ERROR_NO_AGGREGATION;
    return (new AutoConf()).QueryInterface(aIID);
  }
};

var AutoConfModule = {
  CLASS_ID : Components.ID("54382370-f194-11da-8ad9-0800200c9a66"),
  CLASS_NAME : "FoxyProxy AutoConfiguration Component",
  CONTRACT_ID : "@leahscape.org/foxyproxy/autoconf;1",
  
  registerSelf: function(aCompMgr, aFileSpec, aLocation, aType) {
    aCompMgr = aCompMgr.QueryInterface(CI.nsIComponentRegistrar);
    aCompMgr.registerFactoryLocation(this.CLASS_ID, this.CLASS_NAME, this.CONTRACT_ID, aFileSpec, aLocation, aType);
  },

  unregisterSelf: function(aCompMgr, aLocation, aType) {
    aCompMgr = aCompMgr.QueryInterface(CI.nsIComponentRegistrar);
    aCompMgr.unregisterFactoryLocation(this.CLASS_ID, aLocation);        
  },
  
  getClassObject: function(aCompMgr, aCID, aIID) {
    if (!aIID.equals(CI.nsIFactory))
      throw Components.results.NS_ERROR_NOT_IMPLEMENTED;

    if (aCID.equals(this.CLASS_ID))
      return AutoConfFactory;

    throw Components.results.NS_ERROR_NO_INTERFACE;
  },

  canUnload: function(aCompMgr) { return true; }
};

// FoxyProxy's own nsIProxyAutoConfig impl of
// http://mxr.mozilla.org/mozilla-central/source/netwerk/base/src/nsProxyAutoConfig.js.
// Why? Because Gecko's impl is a singleton. FoxyProxy needs multiple instances in order to
// support multiple, simultaneous PAC files (Gecko's impl cannot do this as of Moz 1.9 because
// of the singleon nature of this component)
function nsProxyAutoConfig() {};

nsProxyAutoConfig.prototype = {
    // sandbox in which we eval loaded autoconfig js file
    _sandBox: null, 

    init: function(pacURI, pacText) {
        // remove PAC configuration if requested
        if (pacURI == "" || pacText == "") {
            this._sandBox = null;
            return;
        }

        this._sandBox = new Components.utils.Sandbox(pacURI);
        Components.utils.evalInSandbox(pacUtils, this._sandBox);

        // add predefined functions to pac
        this._sandBox.importFunction(myIpAddress);
        this._sandBox.importFunction(dnsResolve);
        this._sandBox.importFunction(proxyAlert, "alert");

        // evaluate loaded js file
        Components.utils.evalInSandbox(pacText, this._sandBox);

        // We can no longer trust this._sandBox. Touching it directly can
        // cause all sorts of pain, so wrap it in an XPCSafeJSObjectWrapper
        // and do all of our work through there.
        this._sandBox = XPCSJSOWWrapper(this._sandBox, true);
    },

    getProxyForURI: function(testURI, testHost) {
        if (!("FindProxyForURL" in this._sandBox))
            return null;

        // Call the original function
        try {
            var rval = this._sandBox.FindProxyForURL(testURI, testHost);
        } catch (e) {
            throw XPCSJSOWWrapper(e);
        }
        return rval;
    }
}

/** XPCSafeJSObjectWrapper is not available before FF 3.0. Only use it if it's available. **/
function XPCSJSOWWrapper(x, useNew) {
  return typeof(XPCSafeJSObjectWrapper) == "undefined" ?
    x : useNew ? new XPCSafeJSObjectWrapper(x) : XPCSafeJSObjectWrapper(x);
}

function proxyAlert(msg) {
    msg = XPCSJSOWWrapper(msg);
    try {
        // It would appear that the console service is threadsafe.
        var cns = Components.classes["@mozilla.org/consoleservice;1"]
                            .getService(Components.interfaces.nsIConsoleService);
        cns.logStringMessage("PAC-alert: "+msg);
    } catch (e) {
        dump("PAC: proxyAlert ERROR: "+e+"\n");
    }
}

// wrapper for getting local IP address called by PAC file
function myIpAddress() {
    try {
        return dns.resolve(dns.myHostName, 0).getNextAddrAsString();
    } catch (e) {
        return '127.0.0.1';
    }
}

// wrapper for resolving hostnames called by PAC file
function dnsResolve(host) {
    host = XPCSJSOWWrapper(host);
    try {
        return dns.resolve(host, 0).getNextAddrAsString();
    } catch (e) {
        return null;
    }
}

var dns = Components.classes["@mozilla.org/network/dns-service;1"].getService(Components.interfaces.nsIDNSService);

var pacUtils = 
"function dnsDomainIs(host, domain) {\n" +
"    return (host.length >= domain.length &&\n" +
"            host.substring(host.length - domain.length) == domain);\n" +
"}\n" +

"function dnsDomainLevels(host) {\n" +
"    return host.split('.').length-1;\n" +
"}\n" +

"function convert_addr(ipchars) {\n"+
"    var bytes = ipchars.split('.');\n"+
"    var result = ((bytes[0] & 0xff) << 24) |\n"+
"                 ((bytes[1] & 0xff) << 16) |\n"+
"                 ((bytes[2] & 0xff) <<  8) |\n"+
"                  (bytes[3] & 0xff);\n"+
"    return result;\n"+
"}\n"+

"function isInNet(ipaddr, pattern, maskstr) {\n"+
"    var test = /^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$/(ipaddr);\n"+
"    if (test == null) {\n"+
"        ipaddr = dnsResolve(ipaddr);\n"+
"        if (ipaddr == null)\n"+
"            return false;\n"+
"    } else if (test[1] > 255 || test[2] > 255 || \n"+
"               test[3] > 255 || test[4] > 255) {\n"+
"        return false;    // not an IP address\n"+
"    }\n"+
"    var host = convert_addr(ipaddr);\n"+
"    var pat  = convert_addr(pattern);\n"+
"    var mask = convert_addr(maskstr);\n"+
"    return ((host & mask) == (pat & mask));\n"+
"    \n"+
"}\n"+

"function isPlainHostName(host) {\n" +
"    return (host.search('\\\\.') == -1);\n" +
"}\n" +

"function isResolvable(host) {\n" +
"    var ip = dnsResolve(host);\n" +
"    return (ip != null);\n" +
"}\n" +

"function localHostOrDomainIs(host, hostdom) {\n" +
"    return (host == hostdom) ||\n" +
"           (hostdom.lastIndexOf(host + '.', 0) == 0);\n" +
"}\n" +

"function shExpMatch(url, pattern) {\n" +
"   pattern = pattern.replace(/\\./g, '\\\\.');\n" +
"   pattern = pattern.replace(/\\*/g, '.*');\n" +
"   pattern = pattern.replace(/\\?/g, '.');\n" +
"   var newRe = new RegExp('^'+pattern+'$');\n" +
"   return newRe.test(url);\n" +
"}\n" +

"var wdays = {SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6};\n" +

"var months = {JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11};\n"+

"function weekdayRange() {\n" +
"    function getDay(weekday) {\n" +
"        if (weekday in wdays) {\n" +
"            return wdays[weekday];\n" +
"        }\n" +
"        return -1;\n" +
"    }\n" +
"    var date = new Date();\n" +
"    var argc = arguments.length;\n" +
"    var wday;\n" +
"    if (argc < 1)\n" +
"        return false;\n" +
"    if (arguments[argc - 1] == 'GMT') {\n" +
"        argc--;\n" +
"        wday = date.getUTCDay();\n" +
"    } else {\n" +
"        wday = date.getDay();\n" +
"    }\n" +
"    var wd1 = getDay(arguments[0]);\n" +
"    var wd2 = (argc == 2) ? getDay(arguments[1]) : wd1;\n" +
"    return (wd1 == -1 || wd2 == -1) ? false\n" +
"                                    : (wd1 <= wday && wday <= wd2);\n" +
"}\n" +

"function dateRange() {\n" +
"    function getMonth(name) {\n" +
"        if (name in months) {\n" +
"            return months[name];\n" +
"        }\n" +
"        return -1;\n" +
"    }\n" +
"    var date = new Date();\n" +
"    var argc = arguments.length;\n" +
"    if (argc < 1) {\n" +
"        return false;\n" +
"    }\n" +
"    var isGMT = (arguments[argc - 1] == 'GMT');\n" +
"\n" +
"    if (isGMT) {\n" +
"        argc--;\n" +
"    }\n" +
"    // function will work even without explict handling of this case\n" +
"    if (argc == 1) {\n" +
"        var tmp = parseInt(arguments[0]);\n" +
"        if (isNaN(tmp)) {\n" +
"            return ((isGMT ? date.getUTCMonth() : date.getMonth()) ==\n" +
"getMonth(arguments[0]));\n" +
"        } else if (tmp < 32) {\n" +
"            return ((isGMT ? date.getUTCDate() : date.getDate()) == tmp);\n" +
"        } else { \n" +
"            return ((isGMT ? date.getUTCFullYear() : date.getFullYear()) ==\n" +
"tmp);\n" +
"        }\n" +
"    }\n" +
"    var year = date.getFullYear();\n" +
"    var date1, date2;\n" +
"    date1 = new Date(year,  0,  1,  0,  0,  0);\n" +
"    date2 = new Date(year, 11, 31, 23, 59, 59);\n" +
"    var adjustMonth = false;\n" +
"    for (var i = 0; i < (argc >> 1); i++) {\n" +
"        var tmp = parseInt(arguments[i]);\n" +
"        if (isNaN(tmp)) {\n" +
"            var mon = getMonth(arguments[i]);\n" +
"            date1.setMonth(mon);\n" +
"        } else if (tmp < 32) {\n" +
"            adjustMonth = (argc <= 2);\n" +
"            date1.setDate(tmp);\n" +
"        } else {\n" +
"            date1.setFullYear(tmp);\n" +
"        }\n" +
"    }\n" +
"    for (var i = (argc >> 1); i < argc; i++) {\n" +
"        var tmp = parseInt(arguments[i]);\n" +
"        if (isNaN(tmp)) {\n" +
"            var mon = getMonth(arguments[i]);\n" +
"            date2.setMonth(mon);\n" +
"        } else if (tmp < 32) {\n" +
"            date2.setDate(tmp);\n" +
"        } else {\n" +
"            date2.setFullYear(tmp);\n" +
"        }\n" +
"    }\n" +
"    if (adjustMonth) {\n" +
"        date1.setMonth(date.getMonth());\n" +
"        date2.setMonth(date.getMonth());\n" +
"    }\n" +
"    if (isGMT) {\n" +
"    var tmp = date;\n" +
"        tmp.setFullYear(date.getUTCFullYear());\n" +
"        tmp.setMonth(date.getUTCMonth());\n" +
"        tmp.setDate(date.getUTCDate());\n" +
"        tmp.setHours(date.getUTCHours());\n" +
"        tmp.setMinutes(date.getUTCMinutes());\n" +
"        tmp.setSeconds(date.getUTCSeconds());\n" +
"        date = tmp;\n" +
"    }\n" +
"    return ((date1 <= date) && (date <= date2));\n" +
"}\n" +

"function timeRange() {\n" +
"    var argc = arguments.length;\n" +
"    var date = new Date();\n" +
"    var isGMT= false;\n"+
"\n" +
"    if (argc < 1) {\n" +
"        return false;\n" +
"    }\n" +
"    if (arguments[argc - 1] == 'GMT') {\n" +
"        isGMT = true;\n" +
"        argc--;\n" +
"    }\n" +
"\n" +
"    var hour = isGMT ? date.getUTCHours() : date.getHours();\n" +
"    var date1, date2;\n" +
"    date1 = new Date();\n" +
"    date2 = new Date();\n" +
"\n" +
"    if (argc == 1) {\n" +
"        return (hour == arguments[0]);\n" +
"    } else if (argc == 2) {\n" +
"        return ((arguments[0] <= hour) && (hour <= arguments[1]));\n" +
"    } else {\n" +
"        switch (argc) {\n" +
"        case 6:\n" +
"            date1.setSeconds(arguments[2]);\n" +
"            date2.setSeconds(arguments[5]);\n" +
"        case 4:\n" +
"            var middle = argc >> 1;\n" +
"            date1.setHours(arguments[0]);\n" +
"            date1.setMinutes(arguments[1]);\n" +
"            date2.setHours(arguments[middle]);\n" +
"            date2.setMinutes(arguments[middle + 1]);\n" +
"            if (middle == 2) {\n" +
"                date2.setSeconds(59);\n" +
"            }\n" +
"            break;\n" +
"        default:\n" +
"          throw 'timeRange: bad number of arguments'\n" +
"        }\n" +
"    }\n" +
"\n" +
"    if (isGMT) {\n" +
"        date.setFullYear(date.getUTCFullYear());\n" +
"        date.setMonth(date.getUTCMonth());\n" +
"        date.setDate(date.getUTCDate());\n" +
"        date.setHours(date.getUTCHours());\n" +
"        date.setMinutes(date.getUTCMinutes());\n" +
"        date.setSeconds(date.getUTCSeconds());\n" +
"    }\n" +
"    return ((date1 <= date) && (date <= date2));\n" +
"}\n"

