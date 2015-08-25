
var q = require('q');
var path = require('path');
var async = require('async');

var config_loader = require('../../lib/config_loader');

var cwd = process.cwd();
var logger_config_files_dir = path.join(cwd, 'test', 'logger_config_files');


var mock_device_manager = require('../mock_device_manager');
var mockDeviceManager = mock_device_manager.createDeviceManager();

var driver_const = require('ljswitchboard-ljm_driver_constants');

/* Configure what devices to open/create */
mockDeviceManager.configure([{
	'deviceType': driver_const.LJM_DT_T7,
	'serialNumber': 1,
	'connectionType': driver_const.LJM_CT_USB,
}, {
	'deviceType': driver_const.LJM_DT_T7,
	'serialNumber': 2,
	'connectionType': driver_const.LJM_CT_USB,
}]);

/* What logging configurations should be tested. */
var configurations = [
// {
// 	'fileName': 'basic_config.json',
// 	'filePath': '',
// 	'data': undefined,
// 	'core_period': 0,
// 	'dataGroups': [],
// 	'managers': [],
// 	'results': [],

// 	'pattern': [{
// 		"1": ["AIN0"],
// 		"2": ["AIN0"]
// 	}],
// 	'numExpectedPatterns': 4,

// 	'stopCases': {
// 		'basic_data_group': 4,
// 	}
// },
{
	'fileName': 'two_data_groups.json',
	'filePath': '',
	'data': undefined,
	'core_period': 0,
	'dataGroups': [],
	'managers': [],
	'results': [],

	'pattern': [{
		"1": ["AIN1"],
	}, {
		"1": ["AIN0","AIN1"],
		"2": ["AIN0"]
	}],
	'numExpectedPatterns': 2,

	'stopCases': {
		'basic_data_group': 4,
		'secondary_data_group': 8,
	}
}
];

var data_collector;
var dataCollector;
var dcEvents;

function DATA_COLLECTOR_TESTER () {
	this.eventLog = [];

	this.dataGroupData = {};

	this.triggerStopDataCollection = undefined;

	this.config = undefined;

	this.shouldStop = function() {
		var shouldStop = true;

		var data_groups = self.config.data.data_groups;
		data_groups.forEach(function(data_group) {
			var numRequired = self.config.stopCases[data_group];
			var numCollected = self.dataGroupData[data_group].length;
			if(numCollected < numRequired) {
				shouldStop = false;
			}
		});
		return shouldStop;
	};
	this.getEventListener = function(eventName) {
		return function(newData) {
			self.eventLog.push({
				'eventName': eventName,
				'data': newData,
			});

			if(eventName === 'COLLECTOR_DATA') {
				var groupNames = Object.keys(newData);
				groupNames.forEach(function(groupName) {
					var groupData = newData[groupName];
					self.dataGroupData[groupName].push(groupData);

					if(self.shouldStop()) {
						console.log(
							'Stopping Data Collection',
							typeof(self.triggerStopDataCollection)
						);
						if(self.triggerStopDataCollection) {
							self.triggerStopDataCollection();
						}
					}
				});
				// console.log('  - ', newData.groupKey, JSON.stringify(newData.data));
			} else {
				// console.log('!!! Event Fired', eventName, newData);
			}
		};
	};
	this.dataListener = function(newData) {
		console.log('Got new data', newData);
	};
	this.linkToDataCollector = function(bundle) {
		var defered = q.defer();

		var keys = Object.keys(dcEvents);
		keys.forEach(function(key) {
			var eventName = dcEvents[key];
			dataCollector.on(eventName, self.getEventListener(eventName));
		});

		defered.resolve(bundle);
		return defered.promise;
	};
	this.initializeTester = function(config) {
		var defered = q.defer();
		
		// Clear the captured event log
		self.config = config;
		self.eventLog = [];
		self.dataGroupData = {};

		config.data.data_groups.forEach(function(data_group) {
			self.dataGroupData[data_group] = [];
		});

		// Resolve to the actual config data for the data_collector to use for
		// initialization.
		defered.resolve(config.data);
		return defered.promise;
	};
	this.collectData = function(bundle) {
		var defered = q.defer();

		self.triggerStopDataCollection = function() {
			defered.resolve(bundle);
		};
		// setTimeout(function() {
		// 	defered.resolve(bundle);
		// }, 500);
		return defered.promise;
	};

	var reportResults = function(collectorData) {
		var groupNames = Object.keys(collectorData);
		groupNames.forEach(function(groupName) {
			var groupData = collectorData[groupName];
			var serialNumbers = Object.keys(groupData);
			serialNumbers.forEach(function(sn) {
				var deviceData = groupData[sn];
				var results = deviceData.results;
				console.log(groupName, sn, deviceData);
			});
		});
	};
	this.testExecution = function(test) {
		console.log('  - Testing... Number of captured events', self.eventLog.length);

		if(true) {
			self.eventLog.forEach(function(singleEvent) {
				if(singleEvent.eventName === 'COLLECTOR_DATA') {
					console.log(
						'  - ',
						singleEvent.eventName,
						// singleEvent.data,
						Object.keys(singleEvent.data)
					);
					reportResults(singleEvent.data);
					console.log();
				} else if(singleEvent.eventName === 'COLLECTING_DEVICE_DATA') {
					console.log(
						'  - ',
						singleEvent.eventName,
						singleEvent.data.data,
						singleEvent.data.count
					);
				} else if(singleEvent.eventName === 'COLLECTING_GROUP_DATA') {
					console.log(
						'  - ',
						singleEvent.eventName,
						singleEvent.data.data
					);
				} else if(singleEvent.eventName === 'REPORTING_COLLECTED_DATA') {
					console.log(
						'  - ',
						singleEvent.eventName,
						singleEvent.data.data
					);
				} else {
					console.log(
						'  - ',
						singleEvent.eventName
					);
				}
			});
		}
		test.ok(true);
	};
	var self = this;
}
var dataCollectorTester = new DATA_COLLECTOR_TESTER();


exports.tests = {
	'Require data_collector': function(test) {
		try {
			data_collector = require('../../lib/data_collector');
			dcEvents = data_collector.eventList;
			dataCollector = data_collector.create();
			test.ok(true);
		} catch(err) {
			test.ok(false, 'error loading data_collector');
			console.log('Error...', err);
		}
		test.done();
	},
	'Load Test Files': function(test) {
		var promises = configurations.map(function(config) {
			config.filePath = path.join(
				logger_config_files_dir,
				config.fileName
			);

			return config_loader.loadConfigFile(config.filePath)
			.then(function(configData) {
				var defered = q.defer();
				config.data = configData.data;

				debugLog('Loaded File');
				var dataGroupNames = config.data.data_groups;

				debugLog('Group Names', dataGroupNames);
				dataGroupNames.forEach(function(groupName) {
					config.dataGroups.push(config.data[groupName]);
				});

				var periods = [];
				config.dataGroups.forEach(function(dataGroup) {
					periods.push(dataGroup.group_period_ms);
				});

				debugLog('Calculating GCD');
				// Calculate GCD
				if(periods.length > 1) {
					config.core_period = gcd(periods);
				} else {
					config.core_period = periods[0];
				}

				// Calculate the data group's "group_delay" value to determine
				// how frequently the data-groups will report that their values
				// need to be collected.
				config.dataGroups.forEach(function(dataGroup) {
					dataGroup.group_delay = (dataGroup.group_period_ms / config.core_period) - 1;
				});

				debugLog('Data Groups', config.dataGroups);
				defered.resolve();
				return defered.promise;
			}, function(err) {
				var defered = q.defer();
				console.log('Failed to load file...', err);
				test.ok(false, 'Failed to load file... ' + config.fileName + '. ' + err.errorMessage);
				
				defered.reject(err);
				return defered.promise;
			});
		});

		q.allSettled(promises)
		.then(function() {
			test.done();
		});
	},
	'Open Devices': mockDeviceManager.openDevices,
	'Verify Device Info': mockDeviceManager.getDevicesInfo,
	'link tester to data collector': function(test) {
		dataCollectorTester.linkToDataCollector()
		.then(function() {
			test.ok(true);
			test.done();
		})
		.catch(function(error) {
			test.ok(false, 'Failed to link tester to data collector');
			test.done();
		})
		.done();
	},
	'configure data collector': function(test) {
		// Configure the dataCollector with the available device objects.
		var devices = mockDeviceManager.getDevices();
		dataCollector.updateDeviceObjects(devices)
		.then(function() {
			test.ok(true);
			test.done();
		}, function() {
			test.ok(false, 'Should have successfully configured the devices');
			test.done();
		});
	},
	'create data collector object': function(test) {
		// console.log('Configurations', configurations);

		// q.longStackSupport = true;

		async.eachSeries(
			configurations,
			function(configuration, callback) {
				dataCollectorTester.initializeTester(configuration)
				.then(dataCollector.configureDataCollector)
				.then(dataCollector.startDataCollector)
				.then(dataCollectorTester.collectData)
				.then(dataCollector.stopDataCollector)
				.then(function() {
					console.log('Successfully ran data collector...');
					dataCollectorTester.testExecution(test);
					console.log('Delaying to let any data come in...');
					setTimeout(function() {
						callback();
					}, 1000);
				})
				.catch(function(error) {
					test.ok(false,'Caught an error running the data collector');
					console.log('write.... q.longStackSupport = true;');
					console.log('Error...', error);
					console.log('Error Keys', Object.keys(error));
					console.log('Error Stack', error.stack);
					test.done();
				})
				.done();
			}, function(err) {
				test.done();
			});
	},
	'execute and test data collector': function(test) {
		test.done();
	},
	'Close Devices':mockDeviceManager.closeDevices,
};