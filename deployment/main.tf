# Variable for S3 bucket name (optional, but good practice)
variable "s3_bucket_name" {
  description = "Name for the S3 bucket to store processed podcasts."
  type        = string
  default     = "podcast-adblocker-bucket"
}

# IAM role & policy for Lambda
resource "aws_iam_role" "lambda_exec" {
  name = "podcastAdblockerLambdaRole"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_policy.json
}

data "aws_iam_policy_document" "lambda_assume_policy" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy_attachment" "cw_logs" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}



# --- S3 Bucket ---
resource "aws_s3_bucket" "podcast_output" {
  bucket = var.s3_bucket_name # Use the variable

  # Optional: Add versioning, logging, etc.
  # versioning {
  #   enabled = true
  # }

  # Block public access (Recommended)
  force_destroy = false # Set to true only for non-production/testing if needed
}

# --- S3 Access Policy ---
data "aws_iam_policy_document" "s3_write_policy_doc" {
  statement {
    actions = [
      "s3:PutObject",
      "s3:PutObjectAcl" # Might be needed depending on your ACL settings
    ]
    resources = [
      "${aws_s3_bucket.podcast_output.arn}/*", # Grant access to objects within the bucket
    ]
    effect = "Allow"
  }
}

resource "aws_iam_policy" "s3_write_policy" {
  name   = "PodcastAdblockerS3WritePolicy"
  policy = data.aws_iam_policy_document.s3_write_policy_doc.json
}

resource "aws_iam_role_policy_attachment" "s3_write" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = aws_iam_policy.s3_write_policy.arn
}






# Lambda function
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../dist"   # compiled JS
  output_path = "${path.module}/lambda.zip"
}

resource "aws_lambda_function" "podcast_processor" {
  function_name = "podcast-adblocker"
  role          = aws_iam_role.lambda_exec.arn
  handler       = "main.handler"
  runtime       = "nodejs22.x"
  filename      = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  timeout       = 900 
  memory_size   = 2048 # 2 GB


  # environment variables
#   environment {
#     variables = {
#       OPENAI_API_KEY   = var.openai_api_key
#       PODCAST_FEED_URL = var.podcast_feed_url
#     }
#   }
}

# Schedule: trigger every day at midnight UTC (you can customize)
resource "aws_cloudwatch_event_rule" "daily" {
  name                = "podcast-adblocker-schedule"
  schedule_expression = "cron(0 0 * * ? *)"
}

resource "aws_cloudwatch_event_target" "lambda_target" {
  rule      = aws_cloudwatch_event_rule.daily.name
  target_id = "PodcastAdblockerLambda"
  arn       = aws_lambda_function.podcast_processor.arn
}

resource "aws_lambda_permission" "allow_cloudwatch" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.podcast_processor.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily.arn
}
