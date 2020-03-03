const { expect, test } = require("@oclif/test");
const AWS = require("aws-sdk");

const mockGetMetricData = jest.fn();
AWS.CloudWatch.prototype.getMetricData = mockGetMetricData;
const mockListFunctions = jest.fn();
AWS.Lambda.prototype.listFunctions = mockListFunctions;
const mockGetFunctionConfiguration = jest.fn();
AWS.Lambda.prototype.getFunctionConfiguration = mockGetFunctionConfiguration;

const command = "analyze-lambda-cost";

afterEach(() => {
	mockGetMetricData.mockReset();
	mockListFunctions.mockReset();
	mockGetFunctionConfiguration.mockReset();
});

describe("analyze-lambda-cost", () => {
	describe("if a function has no metrics", () => {
		beforeEach(() => {
			givenListFunctionsReturns(["function-a"]);
			givenListFunctionsAlwaysReturns([]);

			givenGetMetricDataAlwaysReturns([
				{ functionName: "function-a", timestamps: [] }
			]);
			givenGetFunctionConfigurationAlwaysReturns("function-a");
		});

		test.stdout()
			.command([command])
			.it("deems the function as no cost", ctx => {
				expect(ctx.stdout).to.contain("function-a");
				expect(ctx.stdout).to.contain("128"); // memory
				expect(ctx.stdout).to.contain("-"); // cost
				expect(ctx.stdout).to.contain("0"); // invocation count
			});

		test.stdout()
			.command([command])
			.it("calls all regions", () => {
				expect(mockListFunctions.mock.calls).to.have.length(16);
			});

		test.stdout()
			.command([command, "-r", "us-east-1"])
			.it("calls only one region", () => {
				expect(mockListFunctions.mock.calls).to.have.length(1);
			});

		test.stdout()
			.command([command, "-r", "us-east-1", "-n", "function-a"])
			.it("calls only one function", () => {
				expect(mockListFunctions.mock.calls).to.be.empty;
				expect(mockGetFunctionConfiguration.mock.calls).to.have.lengthOf(1);
			});

		test.stdout()
			.command([command, "-r", "us-east-1", "-n", "function-a", "-d", "6"])
			.it("only checks the last 6 days", ctx => {
				expect(mockGetMetricData.mock.calls).to.have.lengthOf(1);
				const [req] = mockGetMetricData.mock.calls[0];

				const timeDiff = req.EndTime.getTime() - req.StartTime.getTime();
				const oneDay = 1000 * 60 * 60 * 24;
				expect(Math.round(timeDiff / oneDay)).to.equal(6);

				expect(ctx.stdout).to.contain("6 day ($)");
			});
	});

	describe("if a function has invocation metrics", () => {
		beforeEach(() => {
			givenListFunctionsReturns(["function"]);
			givenListFunctionsAlwaysReturns([]);

			givenGetMetricDataAlwaysReturns([
				{ label: "functionInvocationCount", values: [1000000] }, // 1M invocations
				{ label: "functionDuration", values: [100000000] } // 100M ms = 100ms/invocation
			]);
		});

		test.stdout()
			.command([command])
			.it("calculates the function's cost", ctx => {
				expect(ctx.stdout).to.contain("function");
				expect(ctx.stdout).to.contain("128"); // memory
				expect(ctx.stdout).to.contain("1000000"); // invocation
				expect(ctx.stdout).to.contain("0.0000004080"); // cost per invocation
				expect(ctx.stdout).to.contain("0.4080000000"); // total cost
			});
	});

	describe("if there are more than one page of functions", () => {
		beforeEach(() => {
			givenListFunctionsReturns(["function-a"], true);
			givenListFunctionsReturns(["function-b"]);

			givenGetMetricDataAlwaysReturns([
				{ label: "functionInvocationCount", values: [1000000] }, // 1M invocations
				{ label: "functionDuration", values: [100000000] } // 100M ms = 100ms/invocation
			]);
		});

		test.stdout()
			.command([command, "-r", "us-east-1"])
			.it("recurses and fetches all functions", ctx => {
				expect(mockListFunctions.mock.calls).to.have.length(2);

				expect(ctx.stdout).to.contain("function-a");
				expect(ctx.stdout).to.contain("function-b");
			});
	});
});

function givenGetMetricDataAlwaysReturns(metricData) {
	mockGetMetricData.mockReturnValue({
		promise: () =>
			Promise.resolve({
				MetricDataResults: metricData.map(({ label, values }) => ({
					Label: label,
					Values: values
				}))
			})
	});
}

function givenListFunctionsReturns(functionNames, hasMore = false) {
	mockListFunctions.mockReturnValueOnce({
		promise: () =>
			Promise.resolve({
				Functions: functionNames.map(name => ({
					FunctionName: name,
					Runtime: "nodejs10.x",
					MemorySize: 128,
					CodeSize: 1024,
					LastModified: new Date().toJSON()
				})),
				NextMarker: hasMore ? "more" : undefined
			})
	});
}

function givenListFunctionsAlwaysReturns(functionNames) {
	mockListFunctions.mockReturnValue({
		promise: () =>
			Promise.resolve({
				Functions: functionNames.map(name => ({
					FunctionName: name,
					Runtime: "nodejs10.x",
					MemorySize: 128,
					CodeSize: 1024,
					LastModified: new Date().toJSON()
				}))
			})
	});
}

function givenGetFunctionConfigurationAlwaysReturns(functionName) {
	mockGetFunctionConfiguration.mockReturnValue({
		promise: () =>
			Promise.resolve({
				FunctionName: functionName,
				Runtime: "nodejs10.x",
				MemorySize: 128,
				CodeSize: 1024,
				LastModified: new Date().toJSON()
			})
	});
}
