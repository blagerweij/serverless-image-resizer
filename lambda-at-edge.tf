provider "aws" {
  region = "us-east-1"
}

data "aws_iam_policy_document" "lambda-assume-role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type = "Service"
      identifiers = [
        "edgelambda.amazonaws.com",
        "lambda.amazonaws.com"
      ]
    }
  }
}

data "archive_file" "HandlerZip" {
  type        = "zip"
  source_file = "index.js"
  output_path = "image-resizer.zip"
}


resource "aws_iam_role" "LambdaEdgeRole" {
  name_prefix = "lambda_edge_role"
  assume_role_policy = "${data.aws_iam_policy_document.lambda-assume-role.json}"
}

resource "aws_lambda_function" "ImageResizerFunction" {
  function_name = "ImageResizerFunction"
  runtime = "nodejs8.10"
  role = "${aws_iam_role.LambdaEdgeRole.arn}"
  handler = "index.handler"
  filename = "image-resizer.zip"
  memory_size = 512
  timeout = 30
  publish = true
}

resource "aws_s3_bucket" "img_bucket" {
  bucket = "${var.bucket_name}"
  acl    = "private"
  force_destroy = true
  tags = {
    Name = "${var.bucket_name}"
  }
}

resource "aws_cloudfront_distribution" "cloudfront_distribution" {
  origin {
    domain_name = "${aws_s3_bucket.img_bucket.bucket_regional_domain_name}"
    origin_id = "S3-${var.bucket_name}"
//    s3_origin_config {}
  }
  enabled = true
  price_class = "PriceClass_All"
  default_cache_behavior {
    allowed_methods = [ "DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT" ]
    cached_methods = [ "GET", "HEAD" ]
    target_origin_id = "S3-${var.bucket_name}"
    lambda_function_association {
      event_type = "origin-request"
      lambda_arn = "${aws_lambda_function.ImageResizerFunction.qualified_arn}"
    }
    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
    viewer_protocol_policy = "allow-all"
    min_ttl = 0
    default_ttl = 3600
    max_ttl = 86400
  }
  retain_on_delete = false
  viewer_certificate {
    cloudfront_default_certificate = true
  }
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}
